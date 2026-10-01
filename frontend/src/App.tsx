import { Routes, Route } from "react-router-dom";

import RequireAuth from './components/RequireAuth';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
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
        {/* Signed-in only: without a token these redirect to /login */}
        <Route element={<RequireAuth />}>
          <Route path="/setup" element={<Setup />} />
          <Route path= "/session" element={<Session />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/history" element={<History />} />
        </Route>
        {/* Dev-only data collection tool; intentionally not linked in nav */}
        <Route path="/data-collect" element={<DataCollect />} />


      </Routes>
    </div>
  );
}

export default App;
