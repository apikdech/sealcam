import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { registerServiceWorker } from './lib/pwa/register';
import { applyTheme, followSystemTheme, loadTheme } from './lib/theme/theme';

applyTheme(loadTheme());
followSystemTheme();

mount(App, { target: document.getElementById('app')!, props: { updater: registerServiceWorker() } });
