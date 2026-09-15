import { Routes, Route } from "react-router-dom";

import Header from './components/Header';
import Hero from './components/Hero';
import HowItWorks from './components/HowItWorks';
import Testimonials from './components/Testimonials';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';
import PreSession from './pages/PreSession';
import Session from './pages/Session'; 
import PostSession from './pages/PostSession'; 
import DataCollect from './pages/DataCollect';


function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* <h1>FocusAgent Demo</h1> */}
      {/* <FocusAgent /> */}
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Header />
              <Hero />
              <HowItWorks />
              <Testimonials />
              <FinalCTA />
              <Footer />
            </>
          }
        />
        <Route path="/pre-session" element={<PreSession />} />
        <Route path= "/session" element={<Session />} /> 
        <Route path="/post-session" element={<PostSession />} />
        {/* Dev-only data collection tool; intentionally not linked in nav */}
        <Route path="/data-collect" element={<DataCollect />} />
       

      </Routes>
    </div>
  );
}

export default App;