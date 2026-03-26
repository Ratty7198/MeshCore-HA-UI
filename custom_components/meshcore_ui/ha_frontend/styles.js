// Shared styles for MeshCore UI
export const sharedStyles = `
  :host {
    --mc-bg: var(--primary-background-color, #111827);
    --mc-surface: var(--secondary-background-color, #1f2937);
    --mc-surface2: var(--card-background-color, #374151);
    --mc-border: var(--divider-color, #374151);
    --mc-text: var(--primary-text-color, #f9fafb);
    --mc-text2: var(--secondary-text-color, #9ca3af);
    --mc-accent: var(--primary-color, #6366f1);
    --mc-accent-hover: #818cf8;
    --mc-green: #22c55e;
    --mc-yellow: #eab308;
    --mc-red: #ef4444;
    --mc-blue: #3b82f6;
    --mc-orange: #f97316;
    --mc-radius: 10px;
    --mc-radius-sm: 6px;
    font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .mc-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px; border-radius: var(--mc-radius-sm);
    border: none; cursor: pointer; font-size: 13px; font-weight: 500;
    transition: background 0.15s, opacity 0.15s;
  }
  .mc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .mc-btn-primary { background: var(--mc-accent); color: #fff; }
  .mc-btn-primary:hover:not(:disabled) { background: var(--mc-accent-hover); }
  .mc-btn-secondary { background: var(--mc-surface2); color: var(--mc-text); }
  .mc-btn-secondary:hover:not(:disabled) { background: var(--mc-border); }
  .mc-btn-danger { background: var(--mc-red); color: #fff; }
  .mc-btn-danger:hover:not(:disabled) { background: #dc2626; }
  .mc-btn-ghost {
    background: transparent; color: var(--mc-text2);
    padding: 6px 10px;
  }
  .mc-btn-ghost:hover:not(:disabled) { background: var(--mc-surface2); color: var(--mc-text); }
  .mc-btn-icon {
    background: transparent; border: none; cursor: pointer;
    color: var(--mc-text2); padding: 6px; border-radius: var(--mc-radius-sm);
    display: inline-flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .mc-btn-icon:hover { background: var(--mc-surface2); color: var(--mc-text); }

  .mc-input {
    background: var(--mc-surface2); border: 1px solid var(--mc-border);
    color: var(--mc-text); border-radius: var(--mc-radius-sm);
    padding: 8px 12px; font-size: 14px; width: 100%;
    transition: border-color 0.15s;
  }
  .mc-input:focus { outline: none; border-color: var(--mc-accent); }
  .mc-input::placeholder { color: var(--mc-text2); }

  .mc-select {
    background: var(--mc-surface2); border: 1px solid var(--mc-border);
    color: var(--mc-text); border-radius: var(--mc-radius-sm);
    padding: 8px 12px; font-size: 14px;
    transition: border-color 0.15s; cursor: pointer;
  }
  .mc-select:focus { outline: none; border-color: var(--mc-accent); }

  .mc-card {
    background: var(--mc-surface); border-radius: var(--mc-radius);
    border: 1px solid var(--mc-border); padding: 16px;
  }

  .mc-badge {
    display: inline-block; padding: 2px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; line-height: 1.5;
  }
  .mc-badge-green { background: rgba(34,197,94,0.15); color: var(--mc-green); }
  .mc-badge-yellow { background: rgba(234,179,8,0.15); color: var(--mc-yellow); }
  .mc-badge-red { background: rgba(239,68,68,0.15); color: var(--mc-red); }
  .mc-badge-blue { background: rgba(59,130,246,0.15); color: var(--mc-blue); }
  .mc-badge-gray { background: var(--mc-surface2); color: var(--mc-text2); }

  .mc-spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--mc-border);
    border-top-color: var(--mc-accent);
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .mc-divider { border: none; border-top: 1px solid var(--mc-border); margin: 12px 0; }

  .mc-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; padding: 60px 20px;
    color: var(--mc-text2); text-align: center;
  }
  .mc-empty svg { opacity: 0.3; }
  .mc-empty h3 { font-size: 16px; color: var(--mc-text); }
  .mc-empty p { font-size: 13px; }

  .mc-dialog-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 20px;
  }
  .mc-dialog {
    background: var(--mc-surface); border-radius: var(--mc-radius);
    border: 1px solid var(--mc-border); width: 100%; max-width: 480px;
    max-height: 85vh; overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .mc-dialog-header {
    padding: 18px 20px; border-bottom: 1px solid var(--mc-border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .mc-dialog-header h2 { font-size: 16px; font-weight: 600; }
  .mc-dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .mc-dialog-footer {
    padding: 14px 20px; border-top: 1px solid var(--mc-border);
    display: flex; justify-content: flex-end; gap: 8px;
  }

  .mc-form-row { display: flex; flex-direction: column; gap: 6px; }
  .mc-form-row label { font-size: 13px; color: var(--mc-text2); font-weight: 500; }

  .mc-toast {
    position: fixed; bottom: 20px; right: 20px;
    background: var(--mc-surface); border: 1px solid var(--mc-border);
    border-radius: var(--mc-radius-sm); padding: 12px 16px;
    font-size: 13px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    z-index: 9999; animation: slideIn 0.2s ease;
    display: flex; align-items: center; gap: 8px;
  }
  .mc-toast-success { border-left: 3px solid var(--mc-green); }
  .mc-toast-error { border-left: 3px solid var(--mc-red); }
  @keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: none; opacity: 1; } }

  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
`;
