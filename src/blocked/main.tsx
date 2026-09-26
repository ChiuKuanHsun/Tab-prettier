import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/shippori-mincho/500.css';
import { render } from 'preact';
import { htmlLang, t } from '../i18n';
import { Blocked } from './Blocked';
import './blocked.css';

document.documentElement.lang = htmlLang();
document.title = t('blocked.title');
render(<Blocked />, document.getElementById('app')!);
