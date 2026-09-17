import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Target, ArrowRight, Brain } from 'lucide-react';

const PreSession = () => {
  const [sessionMin, setSessionMin] = useState("");
  const [goal, setGoal] = useState("");
  const [currentStep, setCurrentStep] = useState(0);

  const navigate = useNavigate();

  const handleStartSession = () => {
     // if sessionMinutes is empty, or less than 1 minute
    if (!sessionMin || parseInt(sessionMin) < 1) {
      alert("Please enter a valid duration in minutes.");
      return;
    }

    // Encode query params to avoid breaking URL
    const encodedGoal = encodeURIComponent(goal); //this goal will be updated once user types via controlled input
    navigate(`/session?duration=${sessionMin}&goal=${encodedGoal}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Brain className="w-8 h-8 text-purple-400" />
              <span className="text-2xl font-bold text-white">FocusAgent</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Prepare for <span className="text-purple-400">Deep Work</span>
            </h1>
            <p className="text-xl text-gray-400">
              Let's customize your focus session for maximum productivity
            </p>
          </div>

          {/* Form Cards */}
          <div className="space-y-8">
            {/* Question 1: Duration */}
            <div className="group">
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 transition-all duration-300 hover:bg-gray-800/70 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center group-hover:bg-purple-600/30 transition-colors">
                    <Clock className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">Focus Duration</h3>
                    <p className="text-gray-400">How long do you want to focus?</p>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter minutes (e.g., 25, 45, 90)"
                    value={sessionMin}
                    onChange={(e) => setSessionMin(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all duration-300 text-lg"
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                    min
                  </div>
                </div>
              </div>
            </div>

            {/* Question 2: Goal */}
            <div className="group">
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 transition-all duration-300 hover:bg-gray-800/70 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center group-hover:bg-blue-600/30 transition-colors">
                    <Target className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">Session Goal</h3>
                    <p className="text-gray-400">What's your main objective?</p>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g., Finish my essay, Study chapter 5, Code the login feature"
                  value={goal} 
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all duration-300 text-lg"
                />
              </div>
            </div>

          </div>

          {/* Begin Session Button */}
          <div className="mt-12 text-center">
            <button
              onClick={handleStartSession}
              className="group relative bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-12 py-5 rounded-2xl text-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-purple-500/25 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-blue-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
              <div className="relative flex items-center space-x-3">
                <span>Begin Focus Session</span>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300 -z-10"></div>
            </button>
            
            <p className="text-gray-400 mt-4">
              Your AI focus coach is ready to guide you
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreSession;