-- Runs client.lua against stubbed FiveM globals. Usage (from the resource folder): lua tests/client_spec.lua

local passed, failed = 0, 0

local function test(name, fn)
    local ok, err = pcall(fn)
    if ok then
        passed = passed + 1
    else
        failed = failed + 1
        print('FAIL ' .. name .. '\n  ' .. tostring(err))
    end
end

local function eq(actual, expected, label)
    if actual ~= expected then
        error(('%s: expected %s, got %s'):format(label or 'value', tostring(expected), tostring(actual)), 2)
    end
end

--- Loads client.lua in a fresh environment and returns handles to what it registered and called.
---@param opts { resource?: string, phoneState?: string, addResult?: table, addError?: string }
local function load(opts)
    local h = { calls = {}, callbacks = {}, handlers = {}, printed = {}, phoneState = opts.phoneState or 'started' }

    local phone = {}
    local function record(name)
        return function(_, ...)
            h.calls[#h.calls + 1] = { name = name, args = { ... } }
        end
    end
    phone.SendAppMessage = record('SendAppMessage')
    phone.CloseApp = record('CloseApp')
    phone.AddCustomApp = function(self, app)
        record('AddCustomApp')(self, app)
        if opts.addError then error(opts.addError) end
        return table.unpack(opts.addResult or { true })
    end

    local env = setmetatable({
        GetCurrentResourceName = function() return opts.resource or 'boomer-app-template' end,
        GetResourceState = function(name) return name == 'yboomer-phone' and h.phoneState or 'missing' end,
        GetPlayerName = function() return 'Tester' end,
        PlayerId = function() return 1 end,
        CreateThread = function(fn) fn() end,
        RegisterNUICallback = function(name, fn) h.callbacks[name] = fn end,
        AddEventHandler = function(name, fn) h.handlers[name] = fn end,
        print = function(...) h.printed[#h.printed + 1] = table.concat({ ... }, ' ') end,
        exports = setmetatable({}, {
            __index = function(_, name)
                assert(name == 'yboomer-phone', 'unexpected export resource ' .. tostring(name))
                return phone
            end,
        }),
    }, { __index = _G })

    local chunk = assert(loadfile('client.lua', 't', env))
    chunk()

    function h.count(name)
        local n = 0
        for _, call in ipairs(h.calls) do
            if call.name == name then n = n + 1 end
        end
        return n
    end

    function h.last(name)
        for i = #h.calls, 1, -1 do
            if h.calls[i].name == name then return h.calls[i].args end
        end
    end

    --- Calls a NUI callback and returns what it passed to cb.
    function h.nui(name, data)
        local result
        h.callbacks[name](data, function(value) result = value end)
        return result
    end

    return h
end

test('registers on its own start when the phone is running', function()
    local h = load({})
    eq(h.count('AddCustomApp'), 1, 'AddCustomApp calls')

    local app = h.last('AddCustomApp')[1]
    eq(app.key, 'boomer-app-template', 'key')
    eq(app.ui, 'https://cfx-nui-boomer-app-template/ui/index.html?resource=boomer-app-template', 'ui')
    eq(app.icon, 'https://cfx-nui-boomer-app-template/ui/icon.svg', 'icon')
end)

test('waits for the phone, then registers again on every phone restart', function()
    local h = load({ phoneState = 'stopped' })
    eq(h.count('AddCustomApp'), 0, 'no call while the phone is stopped')

    h.handlers.onResourceStart('some-other-resource')
    eq(h.count('AddCustomApp'), 0, 'other resources are ignored')

    -- FiveM reports 'starting' while the phone's own onResourceStart handlers run.
    h.phoneState = 'starting'
    h.handlers.onResourceStart('yboomer-phone')
    h.handlers.onResourceStart('yboomer-phone')
    eq(h.count('AddCustomApp'), 2, 'one registration per phone start')
end)

test('a renamed resource gets a valid key and its own URLs', function()
    local h = load({ resource = 'My.Cool-App_2' })
    local app = h.last('AddCustomApp')[1]

    eq(app.key, 'My-Cool-App_2', 'key')
    eq(app.ui, 'https://cfx-nui-My.Cool-App_2/ui/index.html?resource=My.Cool-App_2', 'ui')

    local long = load({ resource = string.rep('a', 80) })
    eq(#long.last('AddCustomApp')[1].key, 64, 'key length is capped')
end)

test('a rejected or failing AddCustomApp warns instead of erroring', function()
    local rejected = load({ addResult = { false, 'key is reserved' } })
    assert(rejected.printed[1] and rejected.printed[1]:find('key is reserved', 1, true), 'prints the reason')

    local thrown = load({ addError = 'No such export' })
    assert(thrown.printed[1] and thrown.printed[1]:find('No such export', 1, true), 'prints the error')
end)

test('menu:select rejects malformed or unknown actions', function()
    local h = load({})
    for _, data in ipairs({ 'increment', 42, {}, { id = 5 }, { id = 'drop_tables' }, { id = '__index' } }) do
        eq(h.nui('menu:select', data).ok, false, 'ok for ' .. tostring(data))
    end
    eq(h.nui('menu:select', nil).ok, false, 'ok for nil')
    eq(h.count('SendAppMessage'), 0, 'nothing sent to the app')
end)

test('menu actions update Lua state and push it to the app', function()
    local h = load({})
    eq(h.nui('getState').count, 0, 'initial count')

    eq(h.nui('menu:select', { id = 'increment' }).ok, true, 'increment ok')
    h.nui('menu:select', { id = 'increment' })
    local key, message = table.unpack(h.last('SendAppMessage'))
    eq(key, 'boomer-app-template', 'message app key')
    eq(message.action, 'counter:update', 'message action')
    eq(message.data.count, 2, 'pushed count')
    eq(h.nui('getState').count, 2, 'getState count')

    h.nui('menu:select', { id = 'hello' })
    eq(h.last('SendAppMessage')[2].data.text, 'Hello, Tester!', 'hello text')

    h.nui('menu:select', { id = 'reset' })
    eq(h.last('SendAppMessage')[2].data.count, 0, 'reset count')
end)

test('close callback closes the app; closing event ignores other apps', function()
    local h = load({})
    eq(h.nui('close').ok, true, 'close ok')
    eq(h.count('CloseApp'), 1, 'CloseApp calls')

    h.handlers['yboomer:custom-app:closing']('another-app')
    h.handlers['yboomer:custom-app:closing']('boomer-app-template')
end)

print(('%d passed, %d failed'):format(passed, failed))
os.exit(failed == 0 and 0 or 1)
