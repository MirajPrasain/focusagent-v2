// @ts-ignore - JSX component without TypeScript definitions
import FocusChart from '../report-comps/FocusChart';
// @ts-ignore - JSX component without TypeScript definitions
import FocusDonutChart from '../report-comps/FocusDonutChart';
import StudyDebrief from '../components/StudyDebrief';
import { Brain, TrendingUp } from 'lucide-react';

const PostSession = () => {

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
      {/* Background decorative elements matching Hero/PreSession */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/8 rounded-full blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header Section */}
        <div className="pt-20 pb-12">
          <div className="container mx-auto px-6 text-center">
            <div className="flex items-center justify-center space-x-2 mb-6">
              <Brain className="w-8 h-8 text-purple-400" />
              <span className="text-2xl font-bold text-white">FocusAgent</span>
            </div>
            
            <div className="inline-flex items-center space-x-2 bg-gray-800/50 border border-gray-700 rounded-full px-4 py-2 mb-8">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-sm text-gray-300">Session Analysis Complete</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
                Session
              </span>
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                Complete
              </span>
            </h1>
            
            <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed mb-8">
              Here's how you performed during your focus session. Review your progress and insights below.
            </p>
          </div>
        </div>

        {/* AI-Generated Study Debrief */}
        <div className="animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
          <StudyDebrief />
        </div>

        {/* Charts Container with staggered animations */}
        <div className="space-y-0">
          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
            <FocusChart />
          </div>
          <div className="animate-fade-in-up" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
            <FocusDonutChart />
          </div>
        </div>

        {/* Bottom Spacing */}
        <div className="pb-20"></div>
      </div>
    </div>
  );
};

export default PostSession;