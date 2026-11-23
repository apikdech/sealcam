import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { registerServiceWorker } from './lib/pwa/register';
import { applyTheme, loadTheme } from './lib/theme/theme';

applyTheme(loadTheme());

mount(App, { target: document.getElementById('app')!, props: { updater: registerServiceWorker() } });
