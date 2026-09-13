import { Play, Sparkles } from 'lucide-react';
import {useNavigate} from "react-router-dom";

const Hero = () => {
  const navigate = useNavigate();

  const handleStartStudy = () => {
    navigate(`/pre-session`);
  };

  return (
    <section className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      
      <div className="container mx-auto px-6 text-center relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Animated badge */}
          <div className="inline-flex items-center space-x-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-300">AI-Powered Focus Training</span>
          </div>
          
          {/* Main headline with glow effect */}
          <h1 className="text-6xl md:text-8xl font-bold mb-6 animate-pulse-glow">
            <span className="bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
              Focus like
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              never before.
            </span>
          </h1>
          
          {/* Subheadline */}
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Your AI copilot for distraction-free deep work. Transform solo sessions into 
            an immersive, gamified experience.
          </p>

          {/* Technology highlights */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
            <div className="flex items-center space-x-2 bg-gray-800/30 border border-gray-600 rounded-full px-4 py-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Powered by ElevenLabs Voice</span>
            </div>
            <div className="flex items-center space-x-2 bg-gray-800/30 border border-gray-600 rounded-full px-4 py-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-300">Google MediaPipe Face & Eye Tracking</span>
            </div>
          </div>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button 
              onClick={handleStartStudy}
              className="group bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-purple-500/25"
            >
              <span className="flex items-center space-x-2">
                <Play className="w-5 h-5" />
                <span>Start a Session</span>
              </span>
            </button>
            <button className="text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 px-8 py-4 rounded-full text-lg transition-all duration-300">
              Watch Demo
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-md mx-auto">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">25%</div>
              <div className="text-sm text-gray-400">Focus Increase</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">10k+</div>
              <div className="text-sm text-gray-400">Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">4.9★</div>
              <div className="text-sm text-gray-400">Rating</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;