import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, ArrowRight, Target, Sparkles } from 'lucide-react';

export default function RoadmapGenerator() {
  const [topic, setTopic] = useState("");
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const navigate = useNavigate();

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const generateRoadmap = async () => {
    setLoading(true);
    setRoadmap(null);
    
    try {
      // Step 1: Analyzing topic
      setLoadingStep("Analyzing your learning goals...");
      await sleep(800);
      
      // Step 2: Preparing request
      setLoadingStep("Connecting to AI backend...");
      await sleep(600);
      
      // Step 3: Generating roadmap
      setLoadingStep("Generating personalized roadmap...");
      
      // Use the existing backend API
      const response = await fetch(`${import.meta.env.VITE_GEMINI_API_URL}/api/roadmap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const roadmapData = await response.json();
      
      // Step 4: Processing response
      setLoadingStep("Processing and structuring roadmap...");
      await sleep(500);
      
      setRoadmap(roadmapData);
    } catch (error) {
      console.error('Failed to generate roadmap:', error);
      alert('Failed to generate roadmap. Please try again.');
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

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
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent">
                What do you want to
              </span>
              <br />
              <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                master?
              </span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed">
              State any topic, and we will provide a comprehensive roadmap to master it.
            </p>
          </div>

          {/* Input Section */}
          <div className="group mb-8">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 transition-all duration-300 hover:bg-gray-800/70 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center group-hover:bg-purple-600/30 transition-colors">
                  <BookOpen className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Learning Topic</h3>
                  <p className="text-gray-400">What subject would you like to master?</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g., Neural Networks, React.js, Digital Marketing, Data Science"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-all duration-300 text-lg"
                />
              </div>
              
              <div className="mt-6">
                <button
                  onClick={generateRoadmap}
                  disabled={loading || !topic.trim()}
                  className="w-full group bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <span className="flex items-center justify-center space-x-2">
                    <Target className="w-5 h-5" />
                    <span>{loading ? (loadingStep || "Generating Roadmap...") : "Generate Learning Roadmap"}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Loading Progress */}
          {loading && (
            <div className="mb-12">
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8">
                <div className="text-center">
                  <div className="mb-6">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-4">
                    Creating Your Learning Roadmap
                  </h3>
                  
                  <p className="text-lg text-purple-300 mb-6">
                    {loadingStep || "Getting started..."}
                  </p>
                  
                  <div className="max-w-md mx-auto">
                    <div className="bg-gray-900/50 rounded-full h-2 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-1000 animate-pulse"></div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-400 mt-4">
                    Hang tight! We're analyzing the latest industry standards and best practices.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Roadmap Results */}
          {roadmap && roadmap.stages && (
            <div className="mb-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-4">
                  Your <span className="text-purple-400">{roadmap.topic}</span> Roadmap
                </h2>
                <p className="text-gray-400">
                  Follow this structured path to master your chosen topic
                </p>
              </div>
              
              <div className="space-y-6">
                {roadmap.stages.map((stage: any, i: number) => (
                  <div key={i} className="group">
                    <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 transition-all duration-300 hover:bg-gray-800/70 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10">
                      <div className="flex items-start space-x-4">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 mt-1">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-white mb-4">{stage.title}</h3>
                          
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-gray-300 mb-2 uppercase tracking-wide">Key Topics:</h4>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {stage.subtopics.map((s: string, j: number) => (
                                <li key={j} className="flex items-center space-x-2 text-gray-300">
                                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full flex-shrink-0"></div>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          
                          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-600">
                            <h4 className="text-sm font-medium text-gray-300 mb-2 uppercase tracking-wide">Recommended Projects:</h4>
                            <div className="flex flex-wrap gap-2">
                              {stage.projects.map((project: string, k: number) => (
                                <span key={k} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-600/20 text-blue-300 border border-blue-600/30">
                                  {project}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
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
            
            <p className="text-gray-400 mt-4">
              Ready to put your learning plan into action?
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
