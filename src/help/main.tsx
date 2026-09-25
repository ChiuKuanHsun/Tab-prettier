import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/shippori-mincho/400.css';
import { render } from 'preact';
import { t } from '../i18n';
import { Help } from './Help';
import '../options/options.css';
import './help.css';

document.title = t('help.title');
render(<Help />, document.getElementById('app')!);
