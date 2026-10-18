// Behaviour tests for the template. Run from the resource folder: node --test
// No packages needed. The Lua test needs Lua 5.4 on PATH (or LUA=path/to/lua) and is skipped otherwise.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { createApp, keyFromEvent, resourceName, MENU } = require('../ui/app.js');

/** Builds an app with recording fakes. `replies` maps callback names to JSON responses. */
function setup(replies = {}) {
	const calls = [];
	const posted = [];
	let renders = 0;
	const fetch = async (url, init) => {
		const name = url.split('/').pop();
		calls.push({ url, name, body: JSON.parse(init.body) });
		return { json: async () => replies[name] ?? { ok: true } };
	};
	const app = createApp({ resource: 'my-res', fetch, postToPhone: (m) => posted.push(m), render: () => renders++ });
	return { app, calls, posted, renders: () => renders };
}

test('start posts nui:ready to the phone and loads state from Lua', async () => {
	const { app, calls, posted } = setup({ getState: { count: 7 } });
	await app.start();

	assert.deepEqual(posted, [{ action: 'nui:ready' }]);
	assert.equal(calls[0].url, 'https://my-res/getState');
	assert.equal(app.state.count, 7);
});

test('start still works when Lua is unreachable (opened in a browser)', async () => {
	const app = createApp({ resource: 'x', fetch: async () => { throw new Error('offline'); }, postToPhone() {}, render() {} });
	await app.start();
	assert.equal(app.state.count, 0);
});

test('boomer:key up/down wraps around the menu and Enter calls menu:select', async () => {
	const { app, calls } = setup();

	app.handleMessage({ action: 'boomer:key', data: { key: 'up' } });
	assert.equal(app.state.selected, MENU.length - 1);
	app.handleMessage({ action: 'boomer:key', data: { key: 'down' } });
	app.handleMessage({ action: 'boomer:key', data: { key: 'down' } });
	assert.equal(app.state.selected, 1);

	app.handleMessage({ action: 'boomer:key', data: { key: 'enter' } });
	await new Promise(setImmediate);
	assert.deepEqual(calls.at(-1), { url: 'https://my-res/menu:select', name: 'menu:select', body: { id: MENU[1].id } });
});

test('number keys pick and run a menu entry; out-of-range numbers do nothing', () => {
	const { app, calls } = setup();

	app.handleKey('3');
	assert.equal(app.state.selected, 2);
	assert.deepEqual(calls.at(-1).body, { id: MENU[2].id });

	app.handleKey('9');
	app.handleKey('0');
	assert.equal(calls.length, 1);
});

test('Lua pushes update the view; malformed messages are ignored', () => {
	const { app, renders } = setup();

	app.handleMessage({ action: 'counter:update', data: { count: 3 } });
	app.handleMessage({ action: 'status', data: { text: 'Hello' } });
	assert.equal(app.state.count, 3);
	assert.equal(app.state.status, 'Hello');
	const before = renders();

	for (const message of [null, 'boomer:key', {}, { action: 5 }, { action: 'unknown' }, { action: 'boomer:key', data: { key: 1 } }]) {
		app.handleMessage(message);
	}
	app.handleMessage({ action: 'counter:update', data: { count: '4' } });
	app.handleMessage({ action: 'status', data: { text: { html: '<b>' } } });

	assert.equal(app.state.count, 3);
	assert.equal(app.state.status, 'Hello');
	assert.equal(renders(), before + 2, 'only the two well-formed actions re-render');
});

test('focused-page fallback maps keys like the phone and Backspace closes through Lua', () => {
	assert.equal(keyFromEvent({ key: 'ArrowDown' }), 'down');
	assert.equal(keyFromEvent({ key: 'Enter' }), 'enter');
	assert.equal(keyFromEvent({ key: '5' }), '5');
	assert.equal(keyFromEvent({ key: 'Shift', location: 2 }), 'opt');
	assert.equal(keyFromEvent({ key: 'Shift', location: 1 }), null);
	assert.equal(keyFromEvent({ key: 'a' }), null);
	assert.equal(keyFromEvent({ key: 'Backspace' }), 'back');

	const { app, calls } = setup();
	app.handleKey('back');
	assert.equal(calls.at(-1).url, 'https://my-res/close');
});

test('resource name follows the URL, so renaming the resource works', () => {
	assert.equal(resourceName({ search: '?resource=My.Res', hostname: 'cfx-nui-my.res' }), 'My.Res');
	assert.equal(resourceName({ search: '?resource=my%20res', hostname: 'cfx-nui-fallback' }), 'fallback', 'unsafe names fall back');
	assert.equal(resourceName({ search: '', hostname: 'cfx-nui-renamed-app' }), 'renamed-app');
});

test('client.lua lifecycle and callbacks (Lua stubs)', (t) => {
	const lua = process.env.LUA || 'lua';
	const run = spawnSync(lua, ['tests/client_spec.lua'], { cwd: root, encoding: 'utf8' });
	if (run.error && run.error.code === 'ENOENT') return t.skip(`${lua} is not on PATH (set LUA to a Lua 5.4 binary)`);

	assert.equal(run.status, 0, run.stdout + run.stderr);
	assert.match(run.stdout, /\d+ passed, 0 failed/);
});
