import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="bg-[#0b1325] border-b border-slate-800 select-none text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Authentic Walvoil Brand & Tool Title */}
          <div className="flex items-center space-x-3.5">
            {/* Walvoil Red Emblem */}
            <div className="flex items-center">
              <svg
                viewBox="0 0 48 26"
                className="h-7 w-auto shrink-0 shadow-sm"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Walvoil Logo Mark"
              >
                <rect width="48" height="26" rx="13" fill="#BA1C24" />
                <path
                  d="M12 18 C15 17, 19.5 15, 24 8.5 C28.5 15, 33 17, 36 18 C32 18, 28 16, 24 11.5 C20 16, 16 18, 12 18 Z"
                  fill="white"
                />
              </svg>
            </div>

            <div className="flex items-center space-x-3">
              <span className="font-black tracking-widest text-lg text-white uppercase font-sans">
                WALVOIL
              </span>
              <span className="text-slate-600 font-light text-base">|</span>
              <span className="text-sm font-bold text-white tracking-tight">
                Daily Production Report Digitisation
              </span>
            </div>
          </div>

          {/* Right Header Text */}
          <div className="hidden sm:flex items-center">
            <span className="text-xs font-medium text-slate-400 tracking-wide">
              Internal Production System
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

