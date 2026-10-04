import { Routes, Route } from "react-router-dom";

import RequireAuth from './components/RequireAuth';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import OAuthCallback from './pages/OAuthCallback';
import Setup from './pages/Setup';
import Session from './pages/Session';
import Summary from './pages/Summary';
import History from './pages/History';
import DataCollect from './pages/DataCollect';


function App() {
  return (
    <div className="min-h-screen bg-page text-fg">
      {/* <h1>FocusAgent Demo</h1> */}
      {/* <FocusAgent /> */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Google sign-in lands here with the token: public, since there's no stored token yet */}
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        {/* Signed-in only: without a token these redirect to /login */}
        <Route element={<RequireAuth />}>
          <Route path="/setup" element={<Setup />} />
          <Route path= "/session" element={<Session />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/history" element={<History />} />
          {/* A saved session from History, shown by the summary page */}
          <Route path="/history/:id" element={<Summary />} />
        </Route>
        {/* Dev-only data collection tool; intentionally not linked in nav */}
        <Route path="/data-collect" element={<DataCollect />} />


      </Routes>
    </div>
  );
}

export default App;
