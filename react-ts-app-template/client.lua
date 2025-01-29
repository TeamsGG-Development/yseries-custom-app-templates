---@param action string The action you wish to target
---@param data any The data you wish to send along with this action
function SendUIAction(action, data)
    SendNUIMessage({
        action = action,
        data = data
    })
end

local function AddApp()
    local dataLoaded = exports[Config.PhoneResourceName]:GetDataLoaded()
    while not dataLoaded do
        Wait(500)
        dataLoaded = exports[Config.PhoneResourceName]:GetDataLoaded()
    end

    exports[Config.PhoneResourceName]:AddCustomApp({
        key = Config.AppKey,
        name = "App Template",
        defaultApp = true,
        ui = "https://cfx-nui-" .. GetCurrentResourceName() .. "/ui/dist/index.html", -- built version
        -- ui = "http://localhost:3000",                                           -- dev version
        icon = {
            yos = "https://cdn-icons-png.flaticon.com/512/2314/2314912.png",    -- YPhone OS icon.
            humanoid = "https://cdn-icons-png.flaticon.com/512/566/566312.png", -- YFlip OS icon.
        },
    })
end

-- An example of registering a nui callback
RegisterNuiCallback('get-nui-data', function(_, cb)
    cb('I came from client.lua')
end)

RegisterNUICallback('toggle-NuiFocusKeepInput', function(_focus, cb)
    SetNuiFocusKeepInput(_focus)

    cb({})
end)

AddEventHandler("onResourceStop", function(resource)
    if resource == GetCurrentResourceName() then
        exports[Config.PhoneResourceName]:RemoveCustomApp(Config.AppKey)
    end
end)

AddEventHandler("onResourceStart", function(resource)
    if resource == Config.PhoneResourceName then
        while GetResourceState(Config.PhoneResourceName) ~= "started" do Wait(500) end

        AddApp()
    end
end)

CreateThread(function()
    while GetResourceState(Config.PhoneResourceName) ~= "started" do Wait(500) end

    AddApp()
end)
