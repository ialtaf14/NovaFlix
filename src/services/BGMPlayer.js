class BGMPlayer {
  constructor() {
    this.ctx = null;
    this.oscillators = [];
    this.gainNodes = [];
    this.intervalId = null;
    this.currentTrack = null;
  }

  startCtx() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(movieTitle) {
    if (!movieTitle) return;
    const title = movieTitle.toLowerCase();
    
    try {
      this.startCtx();
      
      if (this.currentTrack === title) return; // Already playing this track
      this.stop();
      this.currentTrack = title;

      if (title.includes('interstellar')) {
        this.playInterstellarLoop();
      } else if (title.includes('inception')) {
        this.playInceptionLoop();
      } else {
        this.playDefaultLoop();
      }
    } catch (e) {
      console.warn("AudioContext failed to start or play:", e);
    }
  }

  playInterstellarLoop() {
    const playRound = () => {
      if (!this.currentTrack || (!this.currentTrack.includes('interstellar'))) return;
      const now = this.ctx.currentTime;
      
      const playDrone = (freq, type, gainVal, duration) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainVal, now + 1.5);
        gain.gain.setValueAtTime(gainVal, now + duration - 1.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.5);
        
        this.oscillators.push(osc);
        this.gainNodes.push(gain);
      };

      // Play organ-like drone for 8 seconds
      playDrone(82.41, 'sine', 0.15, 8); // E2
      playDrone(164.81, 'triangle', 0.1, 8); // E3
      playDrone(246.94, 'sine', 0.08, 8); // B3
      playDrone(329.63, 'sine', 0.06, 8); // E4
    };

    playRound();
    this.intervalId = setInterval(playRound, 8000);
  }

  playInceptionLoop() {
    const playRound = () => {
      if (!this.currentTrack || (!this.currentTrack.includes('inception'))) return;
      const now = this.ctx.currentTime;

      const playBwam = (timeOffset) => {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(55, now + timeOffset); // A1
        osc1.frequency.linearRampToValueAtTime(48, now + timeOffset + 2.0);
        
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(110, now + timeOffset); // A2
        osc2.frequency.linearRampToValueAtTime(98, now + timeOffset + 2.0);
        
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(6, now + timeOffset);
        filter.frequency.setValueAtTime(150, now + timeOffset);
        filter.frequency.exponentialRampToValueAtTime(700, now + timeOffset + 0.1);
        filter.frequency.exponentialRampToValueAtTime(80, now + timeOffset + 1.8);
        
        gain.gain.setValueAtTime(0, now + timeOffset);
        gain.gain.linearRampToValueAtTime(0.3, now + timeOffset + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + timeOffset + 2.0);
        
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc1.start(now + timeOffset);
        osc2.start(now + timeOffset);
        osc1.stop(now + timeOffset + 2.1);
        osc2.stop(now + timeOffset + 2.1);
        
        this.oscillators.push(osc1, osc2);
        this.gainNodes.push(gain);
      };

      // Play Bwam twice in a 6-second cycle
      playBwam(0);
      playBwam(3.0);
    };

    playRound();
    this.intervalId = setInterval(playRound, 6000);
  }

  playDefaultLoop() {
    const playRound = () => {
      if (!this.currentTrack) return;
      const now = this.ctx.currentTime;
      
      const playPad = (freq, gainVal, duration) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(gainVal, now + 1.5);
        gain.gain.setValueAtTime(gainVal, now + duration - 1.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.5);
        
        this.oscillators.push(osc);
        this.gainNodes.push(gain);
      };

      // Beautiful ambient cinematic chord for 6 seconds
      playPad(261.63, 0.12, 6); // C4
      playPad(329.63, 0.08, 6); // E4
      playPad(392.00, 0.06, 6); // G4
      playPad(523.25, 0.04, 6); // C5
    };

    playRound();
    this.intervalId = setInterval(playRound, 6000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.currentTrack = null;

    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.gainNodes.forEach(g => {
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        } catch (_) {}
      });
    }

    const oscs = this.oscillators;
    setTimeout(() => {
      oscs.forEach(o => {
        try {
          o.stop();
        } catch (_) {}
      });
    }, 500);

    this.oscillators = [];
    this.gainNodes = [];
  }
}

const bgmPlayerInstance = new BGMPlayer();
export default bgmPlayerInstance;
