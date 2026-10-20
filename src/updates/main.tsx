import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/shippori-mincho/400.css';
import { render } from 'preact';
import { htmlLang, t } from '../i18n';
import { Updates } from './Updates';
import '../options/options.css';
import '../help/help.css';

document.documentElement.lang = htmlLang();
document.title = t('updates.pageTitle');
render(<Updates />, document.getElementById('app')!);
