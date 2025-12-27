import React, { useState, useRef, useEffect } from 'react';
import bgVideo from './assets/bg01.mp4';


const ILoveMusic = () => {
  const [selected, setSelected] = useState(new Set());
  const [hoveredButton, setHoveredButton] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [pastedUrl, setPastedUrl] = useState('');
  const [playingTrack, setPlayingTrack] = useState(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  const [tracks, setTracks] = useState([]);
  
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBpmMin, setFilterBpmMin] = useState('');
  const [filterBpmMax, setFilterBpmMax] = useState('');
  const [filterArtist, setFilterArtist] = useState('');
  
  // Sorting state
  const [sortBy, setSortBy] = useState('title'); // 'title', 'artist', 'bpm', 'key', 'duration'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  
  // Editing state
  const [editingTrack, setEditingTrack] = useState(null);
  
  const audioRefs = useRef({});

  // Load tracks from localStorage on mount
  useEffect(() => {
    const savedTracks = localStorage.getItem('ilovemusic_tracks');
    if (savedTracks) {
      try {
        const parsedTracks = JSON.parse(savedTracks);
        setTracks(parsedTracks);
      } catch (err) {
        console.error('Error loading tracks from localStorage:', err);
      }
    }
  }, []);

  // Save tracks to localStorage whenever tracks change
  useEffect(() => {
    if (tracks.length > 0) {
      localStorage.setItem('ilovemusic_tracks', JSON.stringify(tracks));
    } else {
      localStorage.removeItem('ilovemusic_tracks');
    }
  }, [tracks]);

  const handleAddSoundCloud = async () => {
    if (!pastedUrl.trim() || loadingTrack) return;
  
    // Check if electron API is available
    if (!window.electron || !window.electron.addSoundCloud) {
      alert('Error: Electron API not available. Please run this app in Electron, not in a regular browser.');
      console.error('window.electron is not available');
      return;
    }
  
    setLoadingTrack(true);
    try {
      const track = await window.electron.addSoundCloud(pastedUrl);
      console.log('Track received:', track);
      console.log('Track BPM:', track.bpm, 'Track Key:', track.key);
      setTracks(prev => [...prev, track]);
      setPastedUrl('');
    } catch (err) {
      let errorMessage = 'Failed to load SoundCloud track';
      if (err.message) {
        if (err.message.includes('ffmpeg') || err.message.includes('ffprobe')) {
          errorMessage = 'ffmpeg is required but not found. Please install ffmpeg:\n\n' +
            'macOS: brew install ffmpeg\n' +
            'Linux: sudo apt install ffmpeg (or your package manager)\n' +
            'Windows: Download from https://ffmpeg.org/download.html';
        } else {
          errorMessage = 'Failed to load SoundCloud track: ' + err.message;
        }
      }
      alert(errorMessage);
      console.error(err);
    } finally {
      setLoadingTrack(false);
    }
  };
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const cleanupFunctions = [];
    
    tracks.forEach(track => {
      if (audioRefs.current[track.id]) {
        const audio = audioRefs.current[track.id];
        
        const handleLoadedMetadata = () => {
          setTracks(prev => prev.map(t => 
            t.id === track.id 
              ? { ...t, duration: audio.duration }
              : t
          ));
        };
        
        const updateProgress = () => {
          setTracks(prev => prev.map(t => 
            t.id === track.id 
              ? { ...t, currentTime: audio.currentTime }
              : t
          ));
        };
        
        const handleEnded = () => {
          setPlayingTrack(null);
          setTracks(prev => prev.map(t => 
            t.id === track.id 
              ? { ...t, currentTime: 0 }
              : t
          ));
        };
        
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', handleEnded);
        
        cleanupFunctions.push(() => {
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('timeupdate', updateProgress);
          audio.removeEventListener('ended', handleEnded);
        });
      }
    });
    
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [tracks]);

  const toggleSelect = (id) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const handleRemoveTrack = (id) => {
    // Stop playing if this track is playing
    if (playingTrack === id) {
      if (audioRefs.current[id]) {
        audioRefs.current[id].pause();
      }
      setPlayingTrack(null);
    }
    
    // Remove from selected if selected
    const newSelected = new Set(selected);
    newSelected.delete(id);
    setSelected(newSelected);
    
    // Remove audio ref
    if (audioRefs.current[id]) {
      delete audioRefs.current[id];
    }
    
    // Remove from tracks
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  const handlePlay = async (id) => {
    Object.keys(audioRefs.current).forEach(key => {
      if (parseInt(key) !== id && audioRefs.current[key]) {
        audioRefs.current[key].pause();
      }
    });
    
    if (playingTrack === id) {
      if (audioRefs.current[id]) {
        audioRefs.current[id].pause();
      }
      setPlayingTrack(null);
    } else {
      if (audioRefs.current[id]) {
        try {
          await audioRefs.current[id].play();
          setPlayingTrack(id);
        } catch (err) {
          console.error('Error playing audio:', err);
          alert('Error playing track. Make sure the file exists.');
        }
      }
    }
  };

  const handleProgressClick = (e, track) => {
    if (!audioRefs.current[track.id]) return;
    
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * track.duration;
    
    audioRefs.current[track.id].currentTime = newTime;
    setTracks(prev => prev.map(t => 
      t.id === track.id 
        ? { ...t, currentTime: newTime }
        : t
    ));
  };

  const handleProgressMouseDown = (e, track) => {
    if (!audioRefs.current[track.id]) return;
    
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    
    const updateProgress = (clientX) => {
      const clickX = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, clickX / rect.width));
      const newTime = percentage * track.duration;
      
      audioRefs.current[track.id].currentTime = newTime;
      setTracks(prev => prev.map(t => 
        t.id === track.id 
          ? { ...t, currentTime: newTime }
          : t
      ));
    };
    
    updateProgress(e.clientX);
    
    const handleMouseMove = (moveEvent) => {
      updateProgress(moveEvent.clientX);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleDownload = async () => {
    if (selected.size === 0 || downloading) return;
    
    setDownloading(true);
    try {
      const trackIds = Array.from(selected);
      const result = await window.electron.downloadTracks(trackIds, tracks);
      
      if (result.success) {
        alert(`Download successful! File saved to Downloads folder.`);
        setSelected(new Set());
      }
    } catch (err) {
      alert('Download failed: ' + (err.message || 'Unknown error'));
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  // Toggle Select All / Deselect All
  const handleToggleSelectAll = () => {
    if (selected.size === tracks.length) {
      // All selected, deselect all
      setSelected(new Set());
    } else {
      // Not all selected, select all
      const allIds = new Set(tracks.map(t => t.id));
      setSelected(allIds);
    }
  };

  // Filter and sort tracks
  const getFilteredAndSortedTracks = () => {
    let filtered = [...tracks];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(track => 
        track.title?.toLowerCase().includes(query) ||
        track.artist?.toLowerCase().includes(query) ||
        track.bpm?.toString().includes(query)
      );
    }

    // Apply BPM filter
    if (filterBpmMin) {
      const min = parseInt(filterBpmMin);
      filtered = filtered.filter(track => track.bpm && track.bpm >= min);
    }
    if (filterBpmMax) {
      const max = parseInt(filterBpmMax);
      filtered = filtered.filter(track => track.bpm && track.bpm <= max);
    }

    // Apply artist filter
    if (filterArtist.trim()) {
      const artist = filterArtist.toLowerCase();
      filtered = filtered.filter(track => track.artist?.toLowerCase().includes(artist));
    }

    // Sort tracks
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'bpm':
          aVal = a.bpm || 0;
          bVal = b.bpm || 0;
          break;
        case 'title':
          aVal = a.title || '';
          bVal = b.title || '';
          break;
        case 'artist':
          aVal = a.artist || '';
          bVal = b.artist || '';
          break;
        case 'duration':
          aVal = a.duration || 0;
          bVal = b.duration || 0;
          break;
        default:
          aVal = a.title || '';
          bVal = b.title || '';
      }

      if (typeof aVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return filtered;
  };

  // Edit track metadata
  const handleEditTrack = (track) => {
    setEditingTrack(track);
  };

  const handleSaveEdit = (updatedTrack) => {
    setTracks(prev => prev.map(t => 
      t.id === updatedTrack.id ? { ...t, ...updatedTrack } : t
    ));
    setEditingTrack(null);
  };

  // Export to Rekordbox format
  const handleExportRekordbox = () => {
    if (!window.electron || !window.electron.exportRekordbox) {
      alert('REKORDBOX EXPORT NOT AVAILABLE');
      return;
    }
    
    const selectedTracks = tracks.filter(t => selected.has(t.id));
    if (selectedTracks.length === 0) {
      alert('PLEASE SELECT TRACKS TO EXPORT');
      return;
    }
    
    window.electron.exportRekordbox(selectedTracks).then(result => {
      if (result.success) {
        alert(`EXPORTED ${selectedTracks.length} TRACKS TO REKORDBOX FORMAT!`);
      } else {
        alert('EXPORT FAILED: ' + (result.error || 'UNKNOWN ERROR'));
      }
    }).catch(err => {
      alert('EXPORT FAILED: ' + err.message);
    });
  };

  
  return (
    <div style={{
      fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Courier New", monospace',
      position: 'relative',
      minHeight: '100vh',
      width: '100vw',
      padding: '0',
      margin: '0',
      color: '#1a1a1a',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      overflowX: 'hidden'
    }}>
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: -1,
          pointerEvents: 'none'
        }}
      >
        <source src={bgVideo} type="video/mp4" />
      </video>
      
      {/* Content Container */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}>
      {tracks.map(track => (
        <audio 
          key={track.id}
          ref={el => {
            if (el) {
              audioRefs.current[track.id] = el;
              // Handle error loading audio
              el.addEventListener('error', (e) => {
                console.error('Audio load error:', e);
                setTracks(prev => prev.map(t => 
                  t.id === track.id ? { ...t, error: true } : t
                ));
              });
            }
          }}
          src={track.url}
          preload="metadata"
          crossOrigin="anonymous"
        />
      ))}

      <div style={{
        padding: '20px 32px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        borderBottom: '1px solid #1a1a1a',
        backgroundColor: '#fff',
        borderRadius: 0
      }}>
        <input
          type="text"
          value={pastedUrl}
          onChange={(e) => setPastedUrl(e.target.value)}
          placeholder="PASTE SOUNDCLOUD URL"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleAddSoundCloud();
            }
          }}
          disabled={loadingTrack}
          style={{
            fontFamily: 'inherit',
            fontSize: '11px',
            letterSpacing: '0.01em',
            padding: '10px 14px',
            border: 'none',
            backgroundColor: '#1a1a1a',
            color: '#fff',
            flex: 1,
            outline: 'none',
            textTransform: 'uppercase',
            borderRadius: 0
          }}
        />
        <button 
          style={{
            fontFamily: 'inherit',
            fontSize: '11px',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            padding: '10px 32px',
            border: 'none',
            backgroundColor: hoveredButton === 'add' ? '#fff' : '#1a1a1a',
            color: hoveredButton === 'add' ? '#1a1a1a' : '#fff',
            cursor: loadingTrack ? 'wait' : 'pointer',
            transition: 'all 0.2s ease-out',
            outline: hoveredButton === 'add' ? '1px solid #1a1a1a' : 'none',
            opacity: loadingTrack ? 0.6 : 1,
            borderRadius: 0
          }}
          onClick={handleAddSoundCloud}
          onMouseEnter={() => !loadingTrack && setHoveredButton('add')}
          onMouseLeave={() => setHoveredButton(null)}
          disabled={loadingTrack}
        >
          {loadingTrack ? 'LOADING...' : 'ADD'}
        </button>
      </div>

      <div style={{
        flex: 1,
        padding: '32px 48px',
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }}>

      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '32px'
      }}>
        {['about', 'preview'].map((item) => {
          const isActive = activeTab === item;
          return (
            <button 
              key={item} 
              onClick={() => setActiveTab(item)}
              style={{
                fontFamily: 'inherit',
                fontSize: '11px',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                backgroundColor: isActive ? '#1a1a1a' : '#fff',
                color: isActive ? '#fff' : '#1a1a1a',
                border: isActive ? '1px solid #fff' : '1px solid #1a1a1a',
                cursor: 'pointer',
                padding: '10px 20px',
                borderRadius: 0,
                outline: 'none'
              }}
            >
              {item}
            </button>
          );
        })}
      </div>

      {activeTab === 'about' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          gap: '24px'
        }}>
          <h1 style={{
            fontSize: '12px',
            fontWeight: '700',
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            color: '#fff',
            margin: -10,
            textAlign: 'center'
          }}>
            MADE BY LOVE ILOVEMUSIC   ❤️   RIPO
          </h1>
          
          <a
            href="https://www.instagram.com/cactusdomain/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'inherit',
              fontSize: '14px',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              padding: '14px 40px',
              border: '2px solid #1a1a1a',
              backgroundColor: '#fff',
              color: '#1a1a1a',
              textDecoration: 'none',
              transition: 'all 0.2s ease-out',
              borderRadius: 0,
              fontWeight: '600',
              display: 'inline-block'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#1a1a1a';
              e.target.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#fff';
              e.target.style.color = '#1a1a1a';
            }}
          >
            @CACTUSDOMAIN
          </a>
        </div>
      )}

      {activeTab === 'preview' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Search & Filter Section */}
        <div style={{
          backgroundColor: '#fff',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginBottom: '16px'
        }}>
          {/* Search Bar */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH TRACKS..."
              style={{
                fontFamily: 'inherit',
                fontSize: '11px',
                padding: '8px 12px',
                border: '1px solid #1a1a1a',
                backgroundColor: '#fff',
                color: '#1a1a1a',
                flex: 1,
                outline: 'none',
                textTransform: 'uppercase'
              }}
            />
            <button
              onClick={handleToggleSelectAll}
              style={{
                fontSize: '11px',
                padding: '8px 16px',
                border: '1px solid #1a1a1a',
                backgroundColor: selected.size === tracks.length ? '#1a1a1a' : '#fff',
                color: selected.size === tracks.length ? '#fff' : '#1a1a1a',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {selected.size === tracks.length ? 'DESELECT ALL' : 'SELECT ALL'}
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="number"
              value={filterBpmMin}
              onChange={(e) => setFilterBpmMin(e.target.value)}
              placeholder="BPM MIN"
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                border: '1px solid #1a1a1a',
                width: '80px',
                outline: 'none',
                textTransform: 'uppercase'
              }}
            />
            <input
              type="number"
              value={filterBpmMax}
              onChange={(e) => setFilterBpmMax(e.target.value)}
              placeholder="BPM MAX"
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                border: '1px solid #1a1a1a',
                width: '80px',
                outline: 'none',
                textTransform: 'uppercase'
              }}
            />
            <input
              type="text"
              value={filterArtist}
              onChange={(e) => setFilterArtist(e.target.value)}
              placeholder="ARTIST"
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                border: '1px solid #1a1a1a',
                flex: 1,
                outline: 'none',
                textTransform: 'uppercase'
              }}
            />
          </div>

          {/* Sort Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase' }}>SORT BY:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                border: '1px solid #1a1a1a',
                backgroundColor: '#fff',
                outline: 'none',
                textTransform: 'uppercase'
              }}
            >
              <option value="title">TITLE</option>
              <option value="artist">ARTIST</option>
              <option value="bpm">BPM</option>
              <option value="duration">DURATION</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{
                fontSize: '11px',
                padding: '6px 12px',
                border: '1px solid #1a1a1a',
                backgroundColor: '#fff',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {sortOrder === 'asc' ? '↑ ASC' : '↓ DESC'}
            </button>
          </div>
        </div>

        {/* Track List */}
        {getFilteredAndSortedTracks().map((track) => {
          const isSelected = selected.has(track.id);
          const isPlaying = playingTrack === track.id;
          const progress = track.duration > 0 ? track.currentTime / track.duration : 0;
          
          return (
            <div
              key={track.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: '#fff',
                padding: '16px',
                gap: '16px',
                border: 'none',
                borderRadius: 0
              }}
            >
              <button
                onClick={() => handlePlay(track.id)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  flexShrink: 0,
                  padding: 0,
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.outline = 'none'}
                onBlur={(e) => e.target.style.outline = 'none'}
              >
                {isPlaying ? (
                  <span style={{ display: 'flex', gap: '2px' }}>
                    <span style={{ width: '3px', height: '10px', backgroundColor: '#1a1a1a' }}></span>
                    <span style={{ width: '3px', height: '10px', backgroundColor: '#1a1a1a' }}></span>
                  </span>
                ) : (
                  <span style={{
                    width: 0,
                    height: 0,
                    borderLeft: '8px solid #1a1a1a',
                    borderTop: '6px solid transparent',
                    borderBottom: '6px solid transparent',
                    marginLeft: '2px'
                  }}></span>
                )}
              </button>

              <div style={{ flex: 1, minWidth: 0, backgroundColor: '#fff' }}>
                <div style={{
                  fontSize: '12px',
                  letterSpacing: '0.01em',
                  marginBottom: '4px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#1a1a1a',
                  textTransform: 'uppercase'
                }}>
                  {track.title} - {track.artist}
                </div>
                {track.bpm && (
                  <div style={{
                    fontSize: '10px',
                    color: '#666',
                    marginBottom: '4px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    textTransform: 'uppercase'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontWeight: '600' }}>BPM:</span>
                      <span>{track.bpm}</span>
                    </span>
                  </div>
                )}
                <div style={{
                  fontSize: '11px',
                  color: '#1a1a1a',
                  marginBottom: '6px',
                  textTransform: 'uppercase'
                }}>
                  {formatTime(track.currentTime)} / {formatTime(track.duration)}
                </div>
                <div 
                  onClick={(e) => handleProgressClick(e, track)}
                  onMouseDown={(e) => handleProgressMouseDown(e, track)}
                  style={{
                    height: '2px',
                    backgroundColor: '#999',
                    position: 'relative',
                    maxWidth: '100%',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${progress * 100}%`,
                    backgroundColor: '#1a1a1a',
                    transition: 'width 0.1s linear'
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => toggleSelect(track.id)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: isSelected ? 'none' : '1px solid #1a1a1a',
                    backgroundColor: isSelected ? '#1a1a1a' : '#fff',
                    color: isSelected ? '#fff' : '#1a1a1a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    fontWeight: 'normal',
                    transition: 'all 0.2s ease-out',
                    outline: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.target.style.backgroundColor = '#1a1a1a';
                      e.target.style.color = '#fff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.target.style.backgroundColor = '#fff';
                      e.target.style.color = '#1a1a1a';
                    }
                  }}
                  title="SELECT/DESELECT"
                >
                  {isSelected ? '−' : '+'}
                </button>
                <button
                  onClick={() => handleEditTrack(track)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '1px solid #1a1a1a',
                    backgroundColor: '#fff',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    transition: 'all 0.2s ease-out'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#1a1a1a';
                    e.target.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#fff';
                    e.target.style.color = '#1a1a1a';
                  }}
                  title="EDIT METADATA"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleRemoveTrack(track.id)}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '1px solid #1a1a1a',
                    backgroundColor: '#fff',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease-out'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#1a1a1a';
                    e.target.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#fff';
                    e.target.style.color = '#1a1a1a';
                  }}
                  title="REMOVE TRACK"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Edit Track Modal */}
      {editingTrack && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setEditingTrack(null)}
        >
          <div style={{
            backgroundColor: '#fff',
            padding: '32px',
            maxWidth: '600px',
            width: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ 
              fontSize: '12px', 
              textTransform: 'uppercase', 
              margin: 0,
              letterSpacing: '0.02em',
              fontWeight: '600'
            }}>
              EDIT TRACK METADATA
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ 
                  fontSize: '11px', 
                  textTransform: 'uppercase', 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '600',
                  letterSpacing: '0.01em'
                }}>
                  TITLE
                </label>
                <input
                  type="text"
                  defaultValue={editingTrack.title}
                  id="edit-title"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ 
                  fontSize: '11px', 
                  textTransform: 'uppercase', 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '600',
                  letterSpacing: '0.01em'
                }}>
                  ARTIST
                </label>
                <input
                  type="text"
                  defaultValue={editingTrack.artist}
                  id="edit-artist"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    outline: 'none',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                onClick={() => setEditingTrack(null)}
                style={{
                  padding: '10px 24px',
                  border: '1px solid #1a1a1a',
                  backgroundColor: '#fff',
                  color: '#1a1a1a',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                  letterSpacing: '0.02em',
                  transition: 'all 0.2s ease-out'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#1a1a1a';
                  e.target.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.color = '#1a1a1a';
                }}
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  const updated = {
                    ...editingTrack,
                    title: document.getElementById('edit-title').value,
                    artist: document.getElementById('edit-artist').value
                  };
                  handleSaveEdit(updated);
                }}
                style={{
                  padding: '10px 24px',
                  border: 'none',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  fontFamily: 'inherit',
                  letterSpacing: '0.02em',
                  transition: 'all 0.2s ease-out'
                }}
                onMouseEnter={(e) => {
                  e.target.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.target.style.opacity = '1';
                }}
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {selected.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '840px',
          width: 'calc(100% - 64px)',
          padding: '14px 20px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          fontSize: '11px',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          boxShadow: '0 4px 12px #1a1a1a',
          transition: 'opacity 0.2s ease-out',
          borderRadius: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>{selected.size} SELECTED</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleExportRekordbox}
                style={{
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  padding: '8px 16px',
                  border: '1px solid #fff',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-out',
                  borderRadius: 0
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.color = '#1a1a1a';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#fff';
                }}
              >
                EXPORT TO REKORDBOX
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  padding: '8px 20px',
                  border: '0px solid #fff',
                  backgroundColor: 'transparent',
                  color: '#fff',
                  cursor: downloading ? 'wait' : 'pointer',
                  transition: 'all 0.2s ease-out',
                  opacity: downloading ? 0.6 : 1,
                  borderRadius: 0
                }}
                onMouseEnter={(e) => {
                  if (!downloading) {
                    e.target.style.backgroundColor = '#fff';
                    e.target.style.color = '#1a1a1a';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.color = '#fff';
                }}
              >
                {downloading 
                  ? 'DOWNLOADING...' 
                  : selected.size === 1 
                    ? 'DOWNLOAD TRACK' 
                    : `DOWNLOAD ${selected.size} AS ZIP`}
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default ILoveMusic;