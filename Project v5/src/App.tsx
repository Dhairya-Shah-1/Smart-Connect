import { useState, useEffect, createContext, useContext } from 'react';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { SignUpPage } from './components/SignUpPage';
import { Dashboard } from './components/Dashboard';

type Page = 'landing' | 'login' | 'signup' | 'dashboard';
type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('landing');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const user = localStorage.getItem('currentUser');
    const savedTheme = localStorage.getItem('theme') as Theme;
    
    if (user) {
      setIsLoggedIn(true);
      setCurrentPage('dashboard');
    }
    
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleLogin = () => {
    setIsLoggedIn(true);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setIsLoggedIn(false);
    setCurrentPage('landing');
  };

  const handleNavigate = (page: Page) => {
    // If user is logged in and tries to go to signup/start reporting, go to dashboard
    if (isLoggedIn && (page === 'signup' || page === 'dashboard')) {
      setCurrentPage('dashboard');
    } else {
      setCurrentPage(page);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'landing':
        return (
          <LandingPage 
            onNavigate={handleNavigate} 
            isLoggedIn={isLoggedIn} 
            onLogout={handleLogout} 
          />
        );
      case 'login':
        return <LoginPage onNavigate={handleNavigate} onLogin={handleLogin} />;
      case 'signup':
        return <SignUpPage onNavigate={handleNavigate} onLogin={handleLogin} />;
      case 'dashboard':
        return <Dashboard onLogout={handleLogout} onNavigateHome={() => setCurrentPage('landing')} />;
      default:
        return (
          <LandingPage 
            onNavigate={handleNavigate} 
            isLoggedIn={isLoggedIn} 
            onLogout={handleLogout}
          />
        );
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={`min-h-screen ${theme === 'dark' ? 'dark' : ''}`}>
        {renderPage()}
      </div>
    </ThemeContext.Provider>
  );
}