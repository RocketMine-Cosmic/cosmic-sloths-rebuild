import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';

export default function Credits() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen relative text-slate-200 p-4 md:p-8 font-mono overflow-hidden">
            <SpaceBackground />

            <div className="max-w-4xl mx-auto relative z-10 text-center">
                <button 
                    onClick={() => navigate('/')}
                    className="mb-8 flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors font-bold"
                >
                    <ArrowLeft size={20} /> Back to Main Menu
                </button>

                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-10 shadow-2xl"
                >
                    <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500 mb-12">
                        CREDITS
                    </h1>

                    <div className="space-y-12 text-slate-300">
                        <div>
                            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 mb-2">
                                <h2 className="text-2xl font-bold text-white">RocketMine(Sloths in Space)</h2>
                                <a href="https://app.omen.foundation?ref=D2EBE0BE67BAAE" target="_blank" rel="noopener noreferrer" className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-full font-bold transition-colors shadow-[0_0_10px_rgba(6,182,212,0.3)]">OmenX Referral Link</a>
                            </div>
                            <p className="text-xl text-emerald-400">Game Design and Development</p>
                        </div>

                        <div>
                            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 mb-2">
                                <h2 className="text-2xl font-bold text-white">Salty(Sloths In Space)</h2>
                                <a href="https://app.omen.foundation/?ref=59880CD0E839EA" target="_blank" rel="noopener noreferrer" className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-full font-bold transition-colors shadow-[0_0_10px_rgba(6,182,212,0.3)]">OmenX Referral Link</a>
                            </div>
                            <p className="text-xl text-emerald-400">Character Design, Testing and Insight</p>
                        </div>

                        <div>
                            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 mb-2">
                                <h2 className="text-2xl font-bold text-white">Crybel(Sloths In Space)</h2>
                                <a href="https://app.omen.foundation/?ref=F00B595C31EDDA" target="_blank" rel="noopener noreferrer" className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-full font-bold transition-colors shadow-[0_0_10px_rgba(6,182,212,0.3)]">OmenX Referral Link</a>
                            </div>
                            <p className="text-xl text-emerald-400">Testing, Advice and Insight</p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Special Thanks</h2>
                            <p className="text-xl text-emerald-400">To all the cosmic sloths out there.</p>
                        </div>

                        
                    </div>
                </motion.div>
            </div>
        </div>
    );
}