import { createRoot } from 'react-dom/client';
import Companion from './Companion';
import OnlineApp from './OnlineApp';
import '../../app/globals.css';
import './preview.css';
createRoot(document.getElementById('root')!).render(import.meta.env.VITE_GIFTS_ONLINE === 'true' ? <OnlineApp /> : <Companion />);
