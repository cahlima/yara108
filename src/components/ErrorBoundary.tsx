import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Erro capturado:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: '#f5f5f5'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '0.5rem',
            maxWidth: '400px',
            textAlign: 'center',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>
              Ops! Algo deu errado
            </h2>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              Ocorreu um erro inesperado.
            </p>
            {this.state.error && (
              <p style={{ 
                fontSize: '0.75rem', 
                color: '#999', 
                backgroundColor: '#f0f0f0',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                marginBottom: '1rem'
              }}>
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={() => window.location.href = '/'}
              style={{
                backgroundColor: '#ea580c',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Ir para o Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
