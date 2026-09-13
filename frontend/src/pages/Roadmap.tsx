import { useNavigate } from "react-router-dom";
import { BookOpen, ArrowRight, Sparkles } from 'lucide-react';

// Roadmap generation relied on the retired Express/Gemini server (/api/roadmap).
// The page is no longer linked; this stub only shows an unavailable notice.
export default function RoadmapGenerator() {
  const navigate = useNavigate();

  const handleNext = () => {
    navigate('/pre-session');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center space-x-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-2 mb-8">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-gray-300">AI-Powered Learning Roadmaps</span>
            </div>
          </div>

          {/* Unavailable notice */}
          <div className="mb-8">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Feature unavailable</h3>
                  <p className="text-gray-400">Learning roadmap generation is currently unavailable.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Next Step Button */}
          <div className="text-center">
            <button
              onClick={handleNext}
              className="group relative bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-12 py-5 rounded-2xl text-xl font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-green-500/25 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 opacity-0 group-hover:opacity-20 transition-opacity duration-300"></div>
              <div className="relative flex items-center space-x-3">
                <span>Next: Start Focus Session</span>
                <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-300 -z-10"></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
