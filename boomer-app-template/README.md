# Boomer App Template

A starter custom app for the YSeries **Boomer** phone (`yboomer-phone`), written in plain HTML, CSS and JavaScript. It needs no build step and no npm.

The demo is a small counter: move with the arrow keys, press OK to run the selected action, or press `1`-`3`. It shows how to:

- add the app to the home screen when the resource starts, and again when the phone restarts
- call NUI callbacks in `client.lua` from the page
- push data from Lua to the page with `SendAppMessage`
- receive the Boomer keypad (`boomer:key`) and handle Enter
- run cleanup code when the app closes

## Install

1. Copy the `boomer-app-template` folder into your server's `resources`. You can rename the folder; the app key and URLs follow the resource name.
2. Add `ensure boomer-app-template` to `server.cfg` after `ensure yboomer-phone`.
3. Start the resource (or restart the server). The app appears on the Boomer home screen.

The phone resource must be named `yboomer-phone`. If yours has another name, change `PHONE_RESOURCE` in `client.lua` and `dependency` in `fxmanifest.lua`.

## Files

| File | Purpose |
| --- | --- |
| `fxmanifest.lua` | Resource manifest. Lists the `ui` files; no `ui_page`, because the phone shows the page in its own iframe. |
| `client.lua` | Registers the app and answers the page's NUI callbacks. |
| `ui/index.html`, `ui/style.css` | The page. Sizes are in `rem`, and `1rem` follows the iframe width, so the layout scales with the phone size setting. |
| `ui/app.js` | Page logic: phone messages, keys, NUI calls. |
| `ui/icon.svg` | Home screen icon (white glyph, like the built-in apps). |
| `tests/` | Behaviour tests. Not loaded by the game. |

## How it works

### Registering

`client.lua` calls `AddCustomApp` on start and on every `onResourceStart` of `yboomer-phone`, since the phone forgets apps when it stops. The phone removes the app by itself when this resource stops.

```lua
exports['yboomer-phone']:AddCustomApp({
    key = APP_KEY,                                   -- the resource name, made key-safe
    name = 'App Template',
    ui = BASE_URL .. 'index.html?resource=' .. RESOURCE,
    icon = BASE_URL .. 'icon.svg',
    closeOnPhoneHide = false,
})
```

`AddCustomApp` returns `ok, err`. The template prints `err` when the phone rejects the app (for example, a key used by a built-in app).

Other fields (`description`, `allowedJobs`, `disabledJobs`, `adminOnly`, ...) and the other exports (`RemoveCustomApp`, `HideCustomApp`, `OpenCustomApp`, `CloseApp`, ...) are described in the [custom apps documentation](https://www.teamsgg.dev/docs/paid-scripts/boomer-phone/custom-apps).

### Page and Lua

- **Page to Lua:** `fetch('https://<resource>/<callback>')`. The page reads the resource name from `?resource=` in its URL, so renaming the resource does not break callbacks.
- **Lua to page:** `exports['yboomer-phone']:SendAppMessage(APP_KEY, { action = 'counter:update', data = { count = 1 } })`. The page receives the table in a `message` event.
- **Ready handshake:** the page posts `{ action: 'nui:ready' }` to the phone once it is listening. Messages sent before that are queued by the phone and delivered then.

The page only accepts messages from the phone (`event.source === window.parent`), ignores malformed ones, and renders text with `textContent`. `client.lua` checks every callback payload and only runs actions from its `actions` table.

### Keys

The phone forwards the keypad as `{ action: 'boomer:key', data: { key } }`. `key` is one of `up`, `down`, `left`, `right`, `enter`, `opt`, `green`, `0`-`9`, `*`, `#`. Backspace (Exit) closes the app; you do not need to handle it.

Keys reach the phone only while the iframe does not have focus. The template therefore:

- has no text inputs and never calls `focus()`
- cancels `mousedown`, so clicking the page does not focus the iframe (clicks still select menu items)
- handles keys itself if the page does get focus, and asks Lua to close the app on Backspace

If your app needs a text input, it will take focus while typing. Blur it when done so `boomer:key` works again.

### Closing

`yboomer:custom-app:closing` fires on the client with the app key whenever a custom app closes. It fires for every app, so compare the key:

```lua
AddEventHandler('yboomer:custom-app:closing', function(appKey)
    if appKey ~= APP_KEY then return end
    -- stop timers, remove cameras or entities, ...
end)
```

The page is unloaded on close and loads fresh on the next open, which is why it asks Lua for the current state (`getState`) on start.

## Customising

- **Name and icon:** `name` and `icon` in `client.lua`. The icon can be any `https://` or `nui://` URL; the phone draws it at about 37px at 100% size.
- **Actions:** add an entry to `MENU` in `ui/app.js` and a function with the same `id` to `actions` in `client.lua`.
- **Server data:** call a server callback or event from the action in `client.lua`, then send the result to the page with `SendAppMessage`. Validate anything the client sends on the server as well.
- **Preview in a browser:** open `ui/index.html` directly. NUI calls fail quietly and the keyboard works, so you can check the layout. Set the window width to 240px for the 100% phone size.

## Tests

```sh
node --test
```

Run from the resource folder. Needs Node 18 or newer and no packages. The `client.lua` test also needs Lua 5.4 on `PATH` (or `LUA=/path/to/lua`); it is skipped without it.

The tests cover registration on start and phone restart, renamed resources, callback validation, Lua-to-page messages, the ready handshake, and key handling.
