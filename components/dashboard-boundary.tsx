'use client';
import { Component, type ReactNode } from 'react';
export default class DashboardBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main>
        <section className="panel recovery-panel" role="alert">
          <h1>Не удалось открыть дашборд</h1>
          <p>
            Попробуйте сбросить фильтры. Загруженные данные и подключение к
            таблицам сохранятся.
          </p>
          <button
            className="recovery-button"
            onClick={() => {
              try {
                localStorage.removeItem('pik-filters');
                localStorage.removeItem('pik-comparison');
              } catch {
                /* Optional storage. */
              }
              window.location.reload();
            }}
          >
            Сбросить фильтры и открыть заново
          </button>
        </section>
      </main>
    );
  }
}
