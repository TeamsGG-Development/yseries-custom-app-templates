-- Boomer custom app template. The phone shows ui/index.html in an iframe; this file registers the app
-- and answers the page's NUI callbacks. Rename the resource folder freely: every name below follows it.

local PHONE_RESOURCE = 'yboomer-phone'

local RESOURCE = GetCurrentResourceName()
-- App keys allow letters, digits, "_" and "-" (max 64). Deriving the key from the resource name keeps
-- two renamed copies of this template from replacing each other on the home screen.
local APP_KEY = (RESOURCE:gsub('[^%w_%-]', '-')):sub(1, 64)
local BASE_URL = ('https://cfx-nui-%s/ui/'):format(RESOURCE)

local count = 0

local function register()
    local called, ok, err = pcall(function()
        return exports[PHONE_RESOURCE]:AddCustomApp({
            key = APP_KEY,
            name = 'App Template',
            description = 'Starter app for the Boomer phone',
            -- The page reads the resource name from the URL to call this file's NUI callbacks.
            ui = BASE_URL .. 'index.html?resource=' .. RESOURCE,
            icon = BASE_URL .. 'icon.svg',
            closeOnPhoneHide = false, -- true closes the app whenever the phone is put away
        })
    end)

    if not called or not ok then
        print(('^3[%s]^7 AddCustomApp failed: %s'):format(RESOURCE, tostring(called and err or ok)))
    end
end

---@param action string
---@param data any
local function sendToApp(action, data)
    exports[PHONE_RESOURCE]:SendAppMessage(APP_KEY, { action = action, data = data })
end

-- Register now, and again whenever the phone restarts: the phone forgets apps when it stops.
CreateThread(function()
    if GetResourceState(PHONE_RESOURCE) == 'started' then register() end
end)

-- No state check here: during its own onResourceStart the phone still reports 'starting',
-- but its exports are already loaded.
AddEventHandler('onResourceStart', function(resource)
    if resource == PHONE_RESOURCE then register() end
end)

-- The phone removes this app by itself when this resource stops; no onResourceStop needed.

--- Menu actions the page may request. Anything else is rejected.
local actions = {
    increment = function()
        count = count + 1
        sendToApp('counter:update', { count = count })
    end,
    reset = function()
        count = 0
        sendToApp('counter:update', { count = count })
    end,
    hello = function()
        sendToApp('status', { text = ('Hello, %s!'):format(GetPlayerName(PlayerId())) })
    end,
}

-- NUI callbacks get whatever JSON the page posts: check every field before using it.

RegisterNUICallback('getState', function(_, cb)
    cb({ count = count })
end)

RegisterNUICallback('menu:select', function(data, cb)
    local action = type(data) == 'table' and type(data.id) == 'string' and actions[data.id] or nil

    if not action then
        cb({ ok = false })
        return
    end

    cb({ ok = true })
    action()
end)

-- Used by the page when it has keyboard focus and Backspace never reaches the phone.
RegisterNUICallback('close', function(_, cb)
    cb({ ok = true })
    exports[PHONE_RESOURCE]:CloseApp()
end)

-- Fires for every custom app, so check the key. Release anything the open app was using here
-- (timers, cameras, spawned entities). The page itself is unloaded by the phone.
AddEventHandler('yboomer:custom-app:closing', function(appKey)
    if appKey ~= APP_KEY then return end
end)
