/*
 * Boomer custom app template. Plain JavaScript, no build step: edit, then restart the resource.
 *
 * The phone shows this page in an iframe and talks to it with window.postMessage:
 *   - phone -> page: { action: 'boomer:key', data: { key } } for the keypad, plus SendAppMessage payloads.
 *   - page -> phone: { action: 'nui:ready' } once listening, so queued SendAppMessage payloads arrive.
 * The page calls its own resource's NUI callbacks (client.lua) with fetch.
 */
(function (root) {
	'use strict';

	const MENU = [
		{ id: 'increment', label: 'Add one' },
		{ id: 'hello', label: 'Say hello' },
		{ id: 'reset', label: 'Reset' },
	];

	/**
	 * Resource name for NUI callbacks: client.lua passes it as ?resource=, the hostname is the fallback.
	 * @param {{ search: string, hostname: string }} location
	 */
	function resourceName(location) {
		const fromQuery = new URLSearchParams(location.search).get('resource');
		if (fromQuery && /^[\w.-]+$/.test(fromQuery)) return fromQuery;

		return location.hostname.replace(/^cfx-nui-/, '');
	}

	/**
	 * Maps a key event to a Boomer key name. Used only when this page has focus, because the phone
	 * forwards keys as 'boomer:key' messages while the iframe is not focused.
	 * @param {{ key: string, location?: number }} event
	 * @returns {string|null} A Boomer key, 'back' for Backspace, or null.
	 */
	function keyFromEvent(event) {
		const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', Backspace: 'back', '*': '*', '#': '#' };

		if (/^[0-9]$/.test(event.key)) return event.key;
		if (event.key === 'Shift') return event.location === 2 ? 'opt' : null;

		return keys[event.key] || null;
	}

	/**
	 * App state and behaviour, without DOM access so it can be tested.
	 * @param {{ resource: string, fetch: Function, postToPhone: Function, render: Function }} deps
	 */
	function createApp({ resource, fetch, postToPhone, render }) {
		const state = { menu: MENU, selected: 0, count: 0, status: 'Use the arrows and OK' };

		function callLua(name, data) {
			return fetch(`https://${resource}/${name}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json; charset=UTF-8' },
				body: JSON.stringify(data || {}),
			})
				.then((response) => response.json())
				.catch(() => null); // Opened outside the game, or the callback failed.
		}

		function setCount(value) {
			if (Number.isInteger(value)) state.count = value;
		}

		function select(index) {
			state.selected = (index + MENU.length) % MENU.length;
			render(state);
		}

		function activate(index) {
			if (index !== undefined) select(index);
			return callLua('menu:select', { id: MENU[state.selected].id });
		}

		function handleKey(key) {
			if (key === 'up') select(state.selected - 1);
			else if (key === 'down') select(state.selected + 1);
			else if (key === 'enter') activate();
			else if (key === 'back') callLua('close');
			else if (/^[1-9]$/.test(key) && Number(key) <= MENU.length) activate(Number(key) - 1);
		}

		/** Handles a message from the phone. Anything malformed is ignored. */
		function handleMessage(message) {
			if (!message || typeof message.action !== 'string') return;

			const data = message.data || {};

			switch (message.action) {
				case 'boomer:key':
					if (typeof data.key === 'string') handleKey(data.key);
					return;
				case 'counter:update':
					setCount(data.count);
					break;
				case 'status':
					if (typeof data.text === 'string') state.status = data.text.slice(0, 80);
					break;
				default:
					return;
			}

			render(state);
		}

		async function start() {
			render(state);
			postToPhone({ action: 'nui:ready' });

			const initial = await callLua('getState');
			if (initial) {
				setCount(initial.count);
				render(state);
			}
		}

		return { state, start, handleKey, handleMessage, activate };
	}

	/** Connects the app to the page. Renders with textContent only, so text from Lua cannot inject HTML. */
	function mount(window) {
		const document = window.document;
		const list = document.getElementById('menu');
		const countEl = document.getElementById('count');
		const statusEl = document.getElementById('status');

		const items = MENU.map((entry, index) => {
			const item = document.createElement('li');
			item.className = 'item';
			item.setAttribute('role', 'option');
			item.dataset.shortcut = String(index + 1);
			item.textContent = entry.label;
			item.addEventListener('click', () => app.activate(index));
			list.appendChild(item);
			return item;
		});

		function render(state) {
			countEl.textContent = String(state.count);
			statusEl.textContent = state.status;

			items.forEach((item, index) => item.setAttribute('aria-selected', String(index === state.selected)));

			// Keep the selected row visible on short screens without scrolling the phone.
			const selected = items[state.selected];
			if (selected.offsetTop < list.scrollTop) list.scrollTop = selected.offsetTop;
			else if (selected.offsetTop + selected.offsetHeight > list.scrollTop + list.clientHeight) {
				list.scrollTop = selected.offsetTop + selected.offsetHeight - list.clientHeight;
			}
		}

		const app = createApp({
			resource: resourceName(window.location),
			fetch: window.fetch.bind(window),
			postToPhone: (message) => window.parent.postMessage(message, '*'),
			render,
		});

		window.addEventListener('message', (event) => {
			// Accept the phone (parent frame) only. Opened directly in a browser, parent is the page itself.
			if (event.source === window.parent) app.handleMessage(event.data);
		});

		// Never take focus on click: a focused iframe stops the phone from receiving keys.
		document.addEventListener('mousedown', (event) => event.preventDefault());

		// If the page got focus anyway, handle keys here so the app keeps working.
		window.addEventListener('keydown', (event) => {
			const key = keyFromEvent(event);
			if (!key) return;

			event.preventDefault();
			app.handleKey(key);
		});

		app.start();
		return app;
	}

	const api = { MENU, resourceName, keyFromEvent, createApp, mount };

	if (typeof module === 'object' && module.exports) module.exports = api;
	else mount(root);
})(typeof window !== 'undefined' ? window : globalThis);
