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
  const [downloadProgress, setDownloadProgress] = useState(0);
  
  const [tracks, setTracks] = useState([]);
  
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBpmMin, setFilterBpmMin] = useState('');
  const [filterBpmMax, setFilterBpmMax] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [filterArtist, setFilterArtist] = useState('');
  
  // Sorting state
  const [sortBy, setSortBy] = useState('title'); // 'title', 'artist', 'bpm', 'key', 'duration'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc', 'desc'
  
  // Queue management
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [shuffleMode, setShuffleMode] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off', 'all', 'one'
  
  // Volume control
  const [volume, setVolume] = useState(1);
  
  // Track history
  const [trackHistory, setTrackHistory] = useState([]);
  const [playCounts, setPlayCounts] = useState({});
  
  // Tags/Categories
  const [trackTags, setTrackTags] = useState({}); // { trackId: ['tag1', 'tag2'] }
  const [filterTag, setFilterTag] = useState('');
  
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
    setDownloadProgress(0);
    
    try {
      const trackIds = Array.from(selected);
      
      // Simulate progress (since we don't have real progress from archiver)
      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);
      
      const result = await window.electron.downloadTracks(trackIds, tracks);
      
      clearInterval(progressInterval);
      setDownloadProgress(100);
      
      if (result.success) {
        setTimeout(() => {
          alert(`Download successful! File saved to Downloads folder.`);
          setSelected(new Set());
          setDownloading(false);
          setDownloadProgress(0);
        }, 500);
      }
    } catch (err) {
      setDownloadProgress(0);
      alert('Download failed: ' + (err.message || 'Unknown error'));
      console.error(err);
      setDownloading(false);
    }
  };

  // Select All / Deselect All
  const handleSelectAll = () => {
    const allIds = new Set(tracks.map(t => t.id));
    setSelected(allIds);
  };

  const handleDeselectAll = () => {
    setSelected(new Set());
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
        track.bpm?.toString().includes(query) ||
        track.key?.toLowerCase().includes(query)
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

    // Apply key filter
    if (filterKey) {
      filtered = filtered.filter(track => track.key && track.key.toLowerCase() === filterKey.toLowerCase());
    }

    // Apply artist filter
    if (filterArtist.trim()) {
      const artist = filterArtist.toLowerCase();
      filtered = filtered.filter(track => track.artist?.toLowerCase().includes(artist));
    }

    // Apply tag filter
    if (filterTag) {
      filtered = filtered.filter(track => {
        const tags = trackTags[track.id] || [];
        return tags.includes(filterTag);
      });
    }

    // Sort tracks
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'bpm':
          aVal = a.bpm || 0;
          bVal = b.bpm || 0;
          break;
        case 'key':
          aVal = a.key || '';
          bVal = b.key || '';
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

  // Calculate statistics
  const getStatistics = () => {
    const totalTracks = tracks.length;
    const totalDuration = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const bpmValues = tracks.filter(t => t.bpm).map(t => t.bpm);
    const averageBpm = bpmValues.length > 0 
      ? Math.round(bpmValues.reduce((sum, bpm) => sum + bpm, 0) / bpmValues.length)
      : null;
    
    // Key distribution
    const keyCounts = {};
    tracks.forEach(t => {
      if (t.key) {
        keyCounts[t.key] = (keyCounts[t.key] || 0) + 1;
      }
    });
    const keyDistribution = Object.entries(keyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalTracks,
      totalDuration,
      averageBpm,
      keyDistribution
    };
  };

  // Update play count and history
  const updatePlayHistory = (trackId) => {
    setPlayCounts(prev => ({
      ...prev,
      [trackId]: (prev[trackId] || 0) + 1
    }));
    
    setTrackHistory(prev => {
      const newHistory = [trackId, ...prev.filter(id => id !== trackId)].slice(0, 50);
      return newHistory;
    });
  };

  // Enhanced play function with queue support
  const handlePlayWithQueue = async (id) => {
    // Update history
    updatePlayHistory(id);
    
    // Handle queue if enabled
    if (queue.length > 0) {
      const currentIndex = queue.findIndex(t => t.id === id);
      if (currentIndex !== -1) {
        setQueueIndex(currentIndex);
      }
    }
    
    // Original play logic
    await handlePlay(id);
  };

  // Queue management functions
  const addToQueue = (trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      setQueue(prev => [...prev, track]);
    }
  };

  const removeFromQueue = (index) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (queueIndex >= index) {
      setQueueIndex(prev => Math.max(0, prev - 1));
    }
  };

  const playNext = () => {
    if (queue.length === 0) return;
    
    let nextIndex;
    if (shuffleMode) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = (queueIndex + 1) % queue.length;
      if (nextIndex === 0 && repeatMode !== 'all') {
        setPlayingTrack(null);
        return;
      }
    }
    
    setQueueIndex(nextIndex);
    handlePlayWithQueue(queue[nextIndex].id);
  };

  const playPrevious = () => {
    if (queue.length === 0) return;
    
    let prevIndex;
    if (shuffleMode) {
      prevIndex = Math.floor(Math.random() * queue.length);
    } else {
      prevIndex = queueIndex === 0 ? queue.length - 1 : queueIndex - 1;
    }
    
    setQueueIndex(prevIndex);
    handlePlayWithQueue(queue[prevIndex].id);
  };

  // Tag management
  const addTag = (trackId, tag) => {
    setTrackTags(prev => ({
      ...prev,
      [trackId]: [...(prev[trackId] || []), tag]
    }));
  };

  const removeTag = (trackId, tag) => {
    setTrackTags(prev => ({
      ...prev,
      [trackId]: (prev[trackId] || []).filter(t => t !== tag)
    }));
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

  // Export/Import Playlist
  const handleExportPlaylist = () => {
    const playlistData = {
      tracks: tracks,
      tags: trackTags,
      playCounts: playCounts,
      exportDate: new Date().toISOString()
    };
    const dataStr = JSON.stringify(playlistData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ILoveMusic-Playlist-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPlaylist = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const playlistData = JSON.parse(event.target.result);
            if (playlistData.tracks) {
              setTracks(playlistData.tracks);
              if (playlistData.tags) setTrackTags(playlistData.tags);
              if (playlistData.playCounts) setPlayCounts(playlistData.playCounts);
              alert('Playlist imported successfully!');
            }
          } catch (err) {
            alert('Error importing playlist: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  // Export to Rekordbox format
  const handleExportRekordbox = () => {
    if (!window.electron || !window.electron.exportRekordbox) {
      alert('Rekordbox export not available');
      return;
    }
    
    const selectedTracks = tracks.filter(t => selected.has(t.id));
    if (selectedTracks.length === 0) {
      alert('Please select tracks to export');
      return;
    }
    
    window.electron.exportRekordbox(selectedTracks).then(result => {
      if (result.success) {
        alert(`Exported ${selectedTracks.length} tracks to Rekordbox format!`);
      } else {
        alert('Export failed: ' + (result.error || 'Unknown error'));
      }
    }).catch(err => {
      alert('Export failed: ' + err.message);
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Space: Play/Pause
      if (e.key === ' ') {
        e.preventDefault();
        if (playingTrack) {
          handlePlay(playingTrack);
        } else if (tracks.length > 0) {
          handlePlayWithQueue(tracks[0].id);
        }
      }

      // Delete: Remove selected track
      if (e.key === 'Delete' && playingTrack) {
        handleRemoveTrack(playingTrack);
      }

      // Cmd/Ctrl+A: Select All
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }

      // Arrow keys for navigation (if queue is active)
      if (queue.length > 0) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          playNext();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          playPrevious();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [playingTrack, tracks, queue, queueIndex]);

  // Apply volume to all audio elements
  useEffect(() => {
    Object.values(audioRefs.current).forEach(audio => {
      if (audio) {
        audio.volume = volume;
      }
    });
  }, [volume]);

  // Auto-play next in queue
  useEffect(() => {
    if (playingTrack === null && queue.length > 0 && repeatMode !== 'off') {
      const currentAudio = audioRefs.current[queue[queueIndex]?.id];
      if (currentAudio && currentAudio.ended) {
        if (repeatMode === 'one') {
          currentAudio.currentTime = 0;
          currentAudio.play();
        } else {
          playNext();
        }
      }
    }
  }, [playingTrack, queue, queueIndex, repeatMode]);
  
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
        marginBottom: '32px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleExportPlaylist}
            style={{
              fontSize: '11px',
              padding: '8px 16px',
              border: '1px solid #1a1a1a',
              backgroundColor: '#fff',
              color: '#1a1a1a',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            EXPORT PLAYLIST
          </button>
          <button
            onClick={handleImportPlaylist}
            style={{
              fontSize: '11px',
              padding: '8px 16px',
              border: '1px solid #1a1a1a',
              backgroundColor: '#fff',
              color: '#1a1a1a',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            IMPORT PLAYLIST
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleExportRekordbox}
              style={{
                fontSize: '11px',
                padding: '8px 16px',
                border: '1px solid #1a1a1a',
                backgroundColor: '#1a1a1a',
                color: '#fff',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              EXPORT TO REKORDBOX
            </button>
          )}
        </div>
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
              onClick={handleSelectAll}
              style={{
                fontSize: '11px',
                padding: '8px 16px',
                border: '1px solid #1a1a1a',
                backgroundColor: '#fff',
                color: '#1a1a1a',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              SELECT ALL
            </button>
            <button
              onClick={handleDeselectAll}
              style={{
                fontSize: '11px',
                padding: '8px 16px',
                border: '1px solid #1a1a1a',
                backgroundColor: '#fff',
                color: '#1a1a1a',
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              DESELECT ALL
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
                outline: 'none'
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
                outline: 'none'
              }}
            />
            <input
              type="text"
              value={filterKey}
              onChange={(e) => setFilterKey(e.target.value)}
              placeholder="KEY"
              style={{
                fontSize: '11px',
                padding: '6px 10px',
                border: '1px solid #1a1a1a',
                width: '80px',
                outline: 'none'
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
                outline: 'none'
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
              <option value="key">KEY</option>
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

        {/* Statistics */}
        {(() => {
          const stats = getStatistics();
          return (
            <div style={{
              backgroundColor: '#fff',
              padding: '12px 16px',
              display: 'flex',
              gap: '24px',
              fontSize: '10px',
              textTransform: 'uppercase',
              marginBottom: '16px'
            }}>
              <span>TRACKS: {stats.totalTracks}</span>
              <span>DURATION: {formatTime(stats.totalDuration)}</span>
              {stats.averageBpm && <span>AVG BPM: {stats.averageBpm}</span>}
              {stats.keyDistribution.length > 0 && (
                <span>
                  TOP KEYS: {stats.keyDistribution.map(([key, count]) => `${key}(${count})`).join(', ')}
                </span>
              )}
            </div>
          );
        })()}

        {/* Volume Control */}
        <div style={{
          backgroundColor: '#fff',
          padding: '12px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', minWidth: '60px' }}>VOLUME:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '11px', minWidth: '40px' }}>{Math.round(volume * 100)}%</span>
        </div>

        {/* Queue Controls */}
        <div style={{
          backgroundColor: '#fff',
          padding: '12px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => setShuffleMode(!shuffleMode)}
            style={{
              fontSize: '11px',
              padding: '6px 12px',
              border: '1px solid #1a1a1a',
              backgroundColor: shuffleMode ? '#1a1a1a' : '#fff',
              color: shuffleMode ? '#fff' : '#1a1a1a',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            SHUFFLE {shuffleMode ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => {
              const modes = ['off', 'all', 'one'];
              const currentIndex = modes.indexOf(repeatMode);
              setRepeatMode(modes[(currentIndex + 1) % modes.length]);
            }}
            style={{
              fontSize: '11px',
              padding: '6px 12px',
              border: '1px solid #1a1a1a',
              backgroundColor: '#fff',
              color: '#1a1a1a',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            REPEAT: {repeatMode.toUpperCase()}
          </button>
          {queue.length > 0 && (
            <span style={{ fontSize: '11px' }}>
              QUEUE: {queue.length} TRACKS
            </span>
          )}
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
                onClick={() => handlePlayWithQueue(track.id)}
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
                {(track.bpm || track.key) && (
                  <div style={{
                    fontSize: '10px',
                    color: '#666',
                    marginBottom: '4px',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    textTransform: 'uppercase'
                  }}>
                    {track.bpm && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: '600' }}>BPM:</span>
                        <span>{track.bpm}</span>
                      </span>
                    )}
                    {track.key && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: '600' }}>Key:</span>
                        <span>{track.key}</span>
                      </span>
                    )}
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
                  title="Select/Deselect"
                >
                  {isSelected ? '−' : '+'}
                </button>
                <button
                  onClick={() => addToQueue(track.id)}
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
                  title="Add to Queue"
                >
                  +
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
                  title="Edit Metadata"
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
                  title="Remove track"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{selected.size} SELECTED</span>
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
              ? `DOWNLOADING... ${downloadProgress}%` 
              : selected.size === 1 
                ? 'DOWNLOAD TRACK' 
                : `DOWNLOAD ${selected.size} AS ZIP`}
          </button>
          </div>
          {downloading && (
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#333',
              position: 'relative'
            }}>
              <div style={{
                width: `${downloadProgress}%`,
                height: '100%',
                backgroundColor: '#fff',
                transition: 'width 0.3s ease-out'
              }} />
            </div>
          )}
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
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '14px', textTransform: 'uppercase', margin: 0 }}>EDIT TRACK METADATA</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>TITLE</label>
                <input
                  type="text"
                  defaultValue={editingTrack.title}
                  id="edit-title"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>ARTIST</label>
                <input
                  type="text"
                  defaultValue={editingTrack.artist}
                  id="edit-artist"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>BPM</label>
                <input
                  type="number"
                  defaultValue={editingTrack.bpm || ''}
                  id="edit-bpm"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>KEY</label>
                <input
                  type="text"
                  defaultValue={editingTrack.key || ''}
                  id="edit-key"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #1a1a1a',
                    fontSize: '11px'
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingTrack(null)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #1a1a1a',
                  backgroundColor: '#fff',
                  color: '#1a1a1a',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textTransform: 'uppercase'
                }}
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  const updated = {
                    ...editingTrack,
                    title: document.getElementById('edit-title').value,
                    artist: document.getElementById('edit-artist').value,
                    bpm: parseInt(document.getElementById('edit-bpm').value) || null,
                    key: document.getElementById('edit-key').value || null
                  };
                  handleSaveEdit(updated);
                }}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  backgroundColor: '#1a1a1a',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '11px',
                  textTransform: 'uppercase'
                }}
              >
                SAVE
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