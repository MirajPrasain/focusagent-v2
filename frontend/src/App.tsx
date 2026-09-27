import { Routes, Route } from "react-router-dom";

import Home from './pages/Home';
import Setup from './pages/Setup';
import Session from './pages/Session'; 
import Summary from './pages/Summary';
import DataCollect from './pages/DataCollect';


function App() {
  return (
    <div className="min-h-screen bg-page text-fg">
      {/* <h1>FocusAgent Demo</h1> */}
      {/* <FocusAgent /> */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path= "/session" element={<Session />} /> 
        <Route path="/summary" element={<Summary />} />
        {/* Dev-only data collection tool; intentionally not linked in nav */}
        <Route path="/data-collect" element={<DataCollect />} />
       

      </Routes>
    </div>
  );
}

export default App;