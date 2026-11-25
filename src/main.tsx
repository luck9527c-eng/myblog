import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initUiScale } from './utils/uiScale.ts';

// 首屏渲染前先把界面缩放到与当前屏幕匹配的比例，避免出现"先小后大"的闪动
initUiScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
