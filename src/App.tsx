import { Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/context/SessionContext";
import { ThemeProvider } from "@/context/ThemeContext";
import OnboardingPage from "@/pages/OnboardingPage";
import GameDashboardPage from "@/pages/GameDashboardPage";
import ResultPage from "@/pages/ResultPage";

function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<OnboardingPage />} />
          <Route path="/game" element={<GameDashboardPage />} />
          <Route path="/result/:sessionId" element={<ResultPage />} />
        </Routes>
      </SessionProvider>
    </ThemeProvider>
  );
}

export default App;
