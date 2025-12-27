const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Fix module resolution for unpacked modules in ASAR
if (app.isPackaged && process.resourcesPath) {
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked');
  if (fs.existsSync(unpackedPath)) {
    // Add unpacked node_modules to module path
    const unpackedNodeModules = path.join(unpackedPath, 'node_modules');
    if (fs.existsSync(unpackedNodeModules)) {
      // Prepend to module.paths so unpacked modules are found first
      module.paths.unshift(unpackedNodeModules);
      
      // Recursively find and add ALL nested node_modules paths
      const allNodeModulesPaths = [];
      function findAllNodeModules(dir, depth = 0) {
        if (depth > 10) return; // Prevent infinite recursion
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const nestedPath = path.join(dir, entry.name, 'node_modules');
              if (fs.existsSync(nestedPath)) {
                allNodeModulesPaths.push(nestedPath);
                // Recursively check deeper nesting
                findAllNodeModules(path.join(dir, entry.name), depth + 1);
              }
            }
          }
        } catch (err) {
          // Ignore errors
        }
      }
      findAllNodeModules(unpackedNodeModules);
      
      // Add all found paths to module.paths (prepend so they're checked first)
      for (const p of allNodeModulesPaths) {
        module.paths.unshift(p);
      }
      
      // Patch Module._resolveFilename to handle nested dependencies better
      const Module = require('module');
      const originalResolveFilename = Module._resolveFilename;
      Module._resolveFilename = function(request, parent, isMain, options) {
        try {
          return originalResolveFilename.call(this, request, parent, isMain, options);
        } catch (err) {
          // If module not found, try searching in all unpacked node_modules
          if (err.code === 'MODULE_NOT_FOUND') {
            // Try to find the module in unpacked directories
            for (const nodeModulesPath of [unpackedNodeModules, ...allNodeModulesPaths]) {
              const modulePath = path.join(nodeModulesPath, request);
              if (fs.existsSync(modulePath) || fs.existsSync(modulePath + '.js')) {
                return modulePath;
              }
              // Try with package.json
              const packagePath = path.join(modulePath, 'package.json');
              if (fs.existsSync(packagePath)) {
                const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                const mainFile = pkg.main || 'index.js';
                const mainPath = path.join(modulePath, mainFile);
                if (fs.existsSync(mainPath)) {
                  return mainPath;
                }
              }
            }
          }
          throw err;
        }
      };
      
      console.log('Added', allNodeModulesPaths.length, 'nested node_modules paths for module resolution');
    }
  }
}

// Try to require music-metadata (optional dependency)
let mm = null;
try {
  mm = require('music-metadata');
} catch (e) {
  console.log('music-metadata not available, BPM/Key extraction from audio files will be limited');
}

// Function to detect BPM from audio file using aubio
async function detectBPMFromAudio(filePath) {
  let tempWav = filePath.replace(/\.[^.]+$/, '_temp_bpm.wav');
  let converted = false;
  
  try {
    const ffmpegPath = getFfmpegPath();
    const aubioPath = getAubioPath();
    
    console.log('Using ffmpeg at:', ffmpegPath);
    console.log('Using aubio at:', aubioPath);
    
    // Check if file is already WAV
    if (!filePath.toLowerCase().endsWith('.wav')) {
      console.log('Converting to WAV for BPM detection...');
      // Convert to WAV mono 44.1kHz for better accuracy
      const convertArgs = [
        '-i', filePath,
        '-ar', '44100', // Sample rate
        '-ac', '1', // Mono
        '-f', 'wav',
        '-y',
        tempWav
      ];
      
      await execFileAsync(ffmpegPath, convertArgs, { timeout: 60000 });
      converted = true;
    } else {
      tempWav = filePath; // Use original file if already WAV
    }
    
    // Use aubio tempo to detect BPM
    const aubioArgs = ['tempo', converted ? tempWav : filePath];
    console.log('Running aubio tempo detection...');
    const { stdout, stderr } = await execFileAsync(aubioPath, aubioArgs, { 
      timeout: 120000, // 2 minutes timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    // Parse aubio output - it outputs tempo values
    const output = stdout.toString() + stderr.toString();
    console.log('aubio output:', output);
    
    // aubio tempo outputs values like "120.00 BPM" or just numbers
    const bpmMatches = output.match(/(\d+\.?\d*)\s*(?:bpm|BPM)?/gi);
    if (bpmMatches && bpmMatches.length > 0) {
      // Take the last value (most stable)
      const lastMatch = bpmMatches[bpmMatches.length - 1];
      const bpmValue = parseFloat(lastMatch.match(/(\d+\.?\d*)/)[1]);
      const detectedBPM = Math.round(bpmValue);
      
      // Valid BPM range (typical music is 60-200 BPM)
      if (detectedBPM >= 60 && detectedBPM <= 200) {
        console.log('BPM detected by aubio:', detectedBPM);
        // Clean up temp file
        if (converted && fs.existsSync(tempWav)) {
          fs.unlinkSync(tempWav);
        }
        return detectedBPM;
      } else if (detectedBPM > 0 && detectedBPM < 60) {
        // Sometimes aubio detects half-time, double it
        const doubledBPM = detectedBPM * 2;
        if (doubledBPM >= 60 && doubledBPM <= 200) {
          console.log('BPM detected by aubio (doubled):', doubledBPM);
          // Clean up temp file
          if (converted && fs.existsSync(tempWav)) {
            fs.unlinkSync(tempWav);
          }
          return doubledBPM;
        }
      }
    }
    
    // Clean up temp file
    if (converted && fs.existsSync(tempWav)) {
      fs.unlinkSync(tempWav);
    }
    
    return null;
  } catch (error) {
    console.log('BPM detection failed:', error.message);
    // Clean up temp file if it exists
    if (fs.existsSync(tempWav)) {
      fs.unlinkSync(tempWav);
    }
    return null;
  }
}

// Function to download artwork image
async function downloadArtwork(thumbnailUrl, outputPath) {
  try {
    const https = require('https');
    const http = require('http');
    const url = require('url');
    
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(thumbnailUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const file = fs.createWriteStream(outputPath);
      
      client.get(thumbnailUrl, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(outputPath);
          });
        } else if (response.statusCode === 301 || response.statusCode === 302) {
          // Handle redirect
          file.close();
          fs.unlinkSync(outputPath);
          downloadArtwork(response.headers.location, outputPath).then(resolve).catch(reject);
        } else {
          file.close();
          fs.unlinkSync(outputPath);
          reject(new Error(`Failed to download artwork: ${response.statusCode}`));
        }
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      });
    });
  } catch (error) {
    console.log('Error downloading artwork:', error.message);
    throw error;
  }
}

// Function to embed artwork to audio file
async function embedArtworkToFile(filePath, artworkPath) {
  if (!fs.existsSync(artworkPath)) {
    console.log('Artwork file not found, skipping embed');
    return;
  }
  
  const fileExt = path.extname(filePath).toLowerCase();
  const tempPath = filePath + '.tmp';
  
  try {
    const ffmpegPath = getFfmpegPath();
    console.log('Embedding artwork using ffmpeg...');
    
    // Use ffmpeg to embed artwork
    const ffmpegArgs = [
      '-i', filePath,
      '-i', artworkPath,
      '-map', '0:a', // Map audio stream
      '-map', '1', // Map image stream
      '-c', 'copy', // Copy codec (no re-encoding for audio)
      '-c:v', 'mjpeg', // Codec for image
      '-disposition:v', 'attached_pic', // Set image as attached picture
      '-y', // Overwrite
      tempPath
    ];
    
    await execFileAsync(ffmpegPath, ffmpegArgs);
    
    // Replace original file with temp file
    fs.renameSync(tempPath, filePath);
    console.log('Artwork embedded successfully using ffmpeg');
  } catch (error) {
    // If ffmpeg fails, try using node-id3 for MP3 files
    if (fileExt === '.mp3') {
      try {
        const NodeID3 = require('node-id3');
        const imageBuffer = fs.readFileSync(artworkPath);
        
        const tags = {
          image: {
            mime: 'image/jpeg',
            type: { id: 3, name: 'front cover' },
            description: 'Cover',
            imageBuffer: imageBuffer
          }
        };
        
        NodeID3.update(tags, filePath);
        console.log('Artwork embedded successfully using node-id3');
        
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (id3Error) {
        console.log('Error embedding artwork with node-id3:', id3Error.message);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        // Don't throw error, just log it
      }
    } else {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      // Don't throw error, just log it
      console.log('Error embedding artwork:', error.message);
    }
  }
}

// Function to write metadata to audio file using ffmpeg
async function writeMetadataToFile(filePath, metadata) {
  const fileExt = path.extname(filePath).toLowerCase();
  const tempPath = filePath + '.tmp';
  
  try {
    const ffmpegPath = getFfmpegPath();
    console.log('Using ffmpeg for metadata writing at:', ffmpegPath);
    
    // Use ffmpeg to write metadata
    const ffmpegArgs = [
      '-i', filePath,
      '-c', 'copy', // Copy codec (no re-encoding)
      '-metadata', `title=${metadata.title || ''}`,
      '-metadata', `artist=${metadata.artist || ''}`
    ];
    
    // Add artwork if provided
    if (metadata.artworkPath && fs.existsSync(metadata.artworkPath)) {
      ffmpegArgs.push('-i', metadata.artworkPath);
      ffmpegArgs.push('-map', '0:a');
      ffmpegArgs.push('-map', '1');
      ffmpegArgs.push('-c:v', 'mjpeg');
      ffmpegArgs.push('-disposition:v', 'attached_pic');
    }
    
    // Add BPM metadata (TBPM tag for ID3v2)
    if (metadata.bpm) {
      if (fileExt === '.mp3') {
        // For MP3, use TBPM tag
        ffmpegArgs.push('-metadata', `TBPM=${Math.round(metadata.bpm)}`);
      } else {
        // For other formats, use bpm tag
        ffmpegArgs.push('-metadata', `bpm=${Math.round(metadata.bpm)}`);
      }
    }
    
    // Add Key metadata
    if (metadata.key) {
      ffmpegArgs.push('-metadata', `initialkey=${metadata.key}`);
      // Also add as comment for compatibility
      ffmpegArgs.push('-metadata', `comment=Key: ${metadata.key}`);
    }
    
    // Output to temp file
    ffmpegArgs.push('-y'); // Overwrite output file
    ffmpegArgs.push(tempPath);
    
    await execFileAsync(ffmpegPath, ffmpegArgs);
    
    // Replace original file with temp file
    fs.renameSync(tempPath, filePath);
    console.log('Metadata written successfully using ffmpeg');
  } catch (error) {
    // If ffmpeg fails, try using node-id3 for MP3 files
    if (fileExt === '.mp3') {
      try {
        const NodeID3 = require('node-id3');
        const tags = {
          title: metadata.title || '',
          artist: metadata.artist || '',
        };
        
        if (metadata.bpm) {
          tags.bpm = Math.round(metadata.bpm).toString();
        }
        
        if (metadata.key) {
          tags.initialKey = metadata.key;
        }
        
        // Add artwork if provided
        if (metadata.artworkPath && fs.existsSync(metadata.artworkPath)) {
          const imageBuffer = fs.readFileSync(metadata.artworkPath);
          tags.image = {
            mime: 'image/jpeg',
            type: { id: 3, name: 'front cover' },
            description: 'Cover',
            imageBuffer: imageBuffer
          };
        }
        
        NodeID3.write(tags, filePath);
        console.log('Metadata written successfully using node-id3');
        
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (id3Error) {
        console.log('Error writing metadata with node-id3:', id3Error.message);
        // Clean up temp file if it exists
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        throw id3Error;
      }
    } else {
      // Clean up temp file if it exists
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1200,
    maxWidth: 1200,
    minHeight: 800,
    maxHeight: 800,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // Prevent fullscreen via keyboard shortcuts
  win.setFullScreenable(false);
  
  // Prevent maximize
  win.setMaximizable(false);
  
  // Prevent minimize (optional, bisa dihapus jika ingin bisa minimize)
  // win.setMinimizable(false);

  // Check if we're in development or production
  // app.isPackaged is true when the app is packaged by electron-builder
  const isDev = !app.isPackaged;
  
  console.log('App is packaged:', app.isPackaged);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('isDev:', isDev);
  
  if (isDev) {
    // Development mode: Wait for Vite dev server to be ready (max 30 seconds)
    const checkServer = async () => {
      const http = require('http');
      const maxAttempts = 60; // 30 seconds total (60 * 500ms)
      let attempts = 0;
      
      return new Promise((resolve, reject) => {
        const check = () => {
          attempts++;
          const req = http.get('http://localhost:5173', (res) => {
            console.log('Vite dev server is ready!');
            resolve(true);
          });
          
          req.on('error', (err) => {
            if (attempts >= maxAttempts) {
              console.error('Vite dev server not available after 30 seconds');
              reject(err);
            } else {
              setTimeout(check, 500); // Retry after 500ms
            }
          });
          
          req.setTimeout(1000, () => {
            req.destroy();
            if (attempts >= maxAttempts) {
              reject(new Error('Timeout waiting for Vite server'));
            } else {
              setTimeout(check, 500);
            }
          });
        };
        check();
      });
    };

    // Load URL after server is ready
    checkServer()
      .then(() => {
        console.log('Loading http://localhost:5173');
        win.loadURL('http://localhost:5173');
      })
      .catch((err) => {
        console.error('Failed to connect to Vite dev server:', err);
        console.log('Attempting to load anyway...');
        win.loadURL('http://localhost:5173');
      });
    
    // Open DevTools for debugging in development
    win.webContents.openDevTools();
    
    // Handle errors
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
      if (errorCode === -106) {
        // ERR_INTERNET_DISCONNECTED or similar
        setTimeout(() => {
          win.loadURL('http://localhost:5173');
        }, 1000);
      }
    });
  } else {
    // Production mode: Load from file system
    // In packaged app, renderer/dist is in extraResources at app/dist
    console.log('Production mode detected');
    console.log('process.resourcesPath:', process.resourcesPath);
    console.log('__dirname:', __dirname);
    console.log('app.getAppPath():', app.getAppPath());
    
    // Try multiple possible paths
    let indexPath = path.join(process.resourcesPath, 'app', 'dist', 'index.html');
    console.log('Trying path 1:', indexPath, 'exists:', fs.existsSync(indexPath));
    
    if (!fs.existsSync(indexPath)) {
      // Fallback: try relative to __dirname
      indexPath = path.join(__dirname, '..', 'app', 'dist', 'index.html');
      console.log('Trying path 2:', indexPath, 'exists:', fs.existsSync(indexPath));
    }
    if (!fs.existsSync(indexPath)) {
      // Another fallback: try in app.getAppPath()
      indexPath = path.join(app.getAppPath(), 'app', 'dist', 'index.html');
      console.log('Trying path 3:', indexPath, 'exists:', fs.existsSync(indexPath));
    }
    if (!fs.existsSync(indexPath)) {
      // Last fallback: try __dirname directly
      indexPath = path.join(__dirname, 'app', 'dist', 'index.html');
      console.log('Trying path 4:', indexPath, 'exists:', fs.existsSync(indexPath));
    }
    
    if (fs.existsSync(indexPath)) {
      console.log('Loading production build from:', indexPath);
      win.loadFile(indexPath).catch(err => {
        console.error('Error loading file:', err);
        win.webContents.openDevTools(); // Open devtools to see the error
      });
    } else {
      console.error('ERROR: Could not find index.html in any expected location!');
      console.error('Searched paths:');
      console.error('  1:', path.join(process.resourcesPath, 'app', 'dist', 'index.html'));
      console.error('  2:', path.join(__dirname, '..', 'app', 'dist', 'index.html'));
      console.error('  3:', path.join(app.getAppPath(), 'app', 'dist', 'index.html'));
      console.error('  4:', path.join(__dirname, 'app', 'dist', 'index.html'));
      win.webContents.openDevTools(); // Open devtools to see the error
    }
  }
  
  // Debug: log jika preload script ter-load
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      console.log('Electron API available:', typeof window.electron !== 'undefined');
      console.log('addSoundCloud available:', typeof window.electron?.addSoundCloud === 'function');
    `).catch(console.error);
  });
  
  // Log console messages from renderer
  win.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });
}

app.whenReady().then(createWindow);

// Helper function to get yt-dlp path
function getYtDlpPath() {
  const isWindows = process.platform === 'win32';
  const exeExtension = isWindows ? '.exe' : '';
  const binaryName = 'yt-dlp' + exeExtension;
  
  // In production, check for bundled yt-dlp
  if (app.isPackaged) {
    const bundledPath = path.join(process.resourcesPath, 'bin', binaryName);
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    // Fallback: try other possible locations
    const altPath = path.join(__dirname, '..', 'bin', binaryName);
    if (fs.existsSync(altPath)) {
      return altPath;
    }
  }
  // In development or if bundled version not found, use system yt-dlp
  return 'yt-dlp' + exeExtension;
}

// Helper function to get ffmpeg path
function getFfmpegPath() {
  // In production, check for bundled ffmpeg
  if (app.isPackaged) {
    const bundledPath = path.join(process.resourcesPath, 'bin', 'ffmpeg');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    const altPath = path.join(__dirname, '..', 'bin', 'ffmpeg');
    if (fs.existsSync(altPath)) {
      return altPath;
    }
    // Check common macOS installation paths
    const commonPaths = [
      '/opt/homebrew/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg'
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  // In development or if bundled version not found, use system ffmpeg
  return 'ffmpeg';
}

// Helper function to get aubio path
function getAubioPath() {
  // In production, check for bundled aubio
  if (app.isPackaged) {
    const bundledPath = path.join(process.resourcesPath, 'bin', 'aubio');
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    const altPath = path.join(__dirname, '..', 'bin', 'aubio');
    if (fs.existsSync(altPath)) {
      return altPath;
    }
    // Check common macOS installation paths
    const commonPaths = [
      '/opt/homebrew/bin/aubio',
      '/usr/local/bin/aubio',
      '/usr/bin/aubio'
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  // In development or if bundled version not found, use system aubio
  return 'aubio';
}

// Handler untuk menambahkan track SoundCloud
ipcMain.handle('soundcloud:add', async (_, url) => {
  try {
    const ytDlpPath = getYtDlpPath();
    console.log('Using yt-dlp at:', ytDlpPath);
    
    const outputDir = path.join(app.getPath('userData'), 'tracks');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Pertama, dapatkan info track tanpa download
    const infoArgs = [
      '--print-json',
      '--no-download',
      url
    ];

    const { stdout: infoStdout } = await execFileAsync(ytDlpPath, infoArgs);
    const info = JSON.parse(infoStdout);

    // Download track - coba dengan format yang tersedia tanpa conversion dulu
    // Jika perlu conversion, akan error dan kita handle
    const downloadArgs = [
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '0',
      '--prefer-ffmpeg',
      '-o', path.join(outputDir, `${info.id}.%(ext)s`),
      url
    ];

    // Get files before download
    const filesBefore = new Set();
    if (fs.existsSync(outputDir)) {
      const existingFiles = fs.readdirSync(outputDir);
      existingFiles.forEach(f => filesBefore.add(f));
    }
    
    try {
      await execFileAsync(ytDlpPath, downloadArgs);
    } catch (downloadError) {
      // Jika error karena ffmpeg, coba download format asli tanpa conversion
      if (downloadError.message && (downloadError.message.includes('ffmpeg') || downloadError.message.includes('ffprobe'))) {
        console.log('ffmpeg not found, trying to download original format...');
        const originalArgs = [
          '-x',
          '-f', 'bestaudio',
          '-o', path.join(outputDir, `${info.id}.%(ext)s`),
          url
        ];
        await execFileAsync(ytDlpPath, originalArgs);
      } else {
        throw downloadError;
      }
    }

    // Tunggu sebentar untuk memastikan file sudah ditulis
    await new Promise(resolve => setTimeout(resolve, 500));

    // Cari file yang baru saja didownload (support berbagai format audio)
    const filesAfter = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
    const audioExtensions = ['.mp3', '.m4a', '.opus', '.ogg', '.webm', '.flac', '.wav', '.aac', '.mka'];
    
    // Cari file baru yang tidak ada di filesBefore
    let downloadedFile = filesAfter.find(f => 
      !filesBefore.has(f) && 
      audioExtensions.some(ext => f.toLowerCase().endsWith(ext))
    );
    
    // Jika tidak ditemukan file baru, coba cari file dengan ID yang sama
    if (!downloadedFile) {
      downloadedFile = filesAfter.find(f => 
        f.startsWith(info.id.toString()) && 
        audioExtensions.some(ext => f.toLowerCase().endsWith(ext))
      );
    }
    
    // Jika masih tidak ditemukan, cari file audio terbaru berdasarkan waktu modifikasi
    if (!downloadedFile) {
      const audioFiles = filesAfter
        .filter(f => audioExtensions.some(ext => f.toLowerCase().endsWith(ext)))
        .map(f => ({
          name: f,
          path: path.join(outputDir, f),
          mtime: fs.statSync(path.join(outputDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      if (audioFiles.length > 0) {
        // Ambil file terbaru yang dimodifikasi dalam 30 detik terakhir
        const recentFile = audioFiles.find(f => 
          Date.now() - f.mtime < 30000
        );
        if (recentFile) {
          downloadedFile = recentFile.name;
        }
      }
    }
    
    if (!downloadedFile) {
      console.error('Files before:', Array.from(filesBefore));
      console.error('Files after:', filesAfter);
      console.error('Output dir:', outputDir);
      throw new Error(`Downloaded file not found. Files in directory: ${filesAfter.join(', ')}`);
    }
    
    const filePath = path.join(outputDir, downloadedFile);

    // Gunakan path absolut dengan file:// protocol
    const trackId = Date.now();
    const absolutePath = path.resolve(filePath);
    
    // Extract BPM dan Key dari metadata
    let bpm = null;
    let key = null;
    
    try {
      console.log('Extracting BPM/Key from track:', info.title);
      
      // Cek apakah ada di tags SoundCloud
      if (info.tags) {
        const tags = Array.isArray(info.tags) ? info.tags : [info.tags];
        console.log('Tags found:', tags);
        // Cari BPM dan Key di tags
        tags.forEach(tag => {
          if (typeof tag === 'string') {
            const bpmMatch = tag.match(/bpm[:\s]*(\d+)/i);
            if (bpmMatch) {
              bpm = parseInt(bpmMatch[1]);
              console.log('BPM found in tags:', bpm);
            }
            
            const keyMatch = tag.match(/([A-G][#b]?m?)\s*(?:key|tonality)/i);
            if (keyMatch) {
              key = keyMatch[1];
              console.log('Key found in tags:', key);
            }
          }
        });
      }
      
      // Cek di description
      if (info.description) {
        const desc = info.description;
        console.log('Description length:', desc.length);
        const bpmMatch = desc.match(/bpm[:\s]*(\d+)/i);
        if (bpmMatch && !bpm) {
          bpm = parseInt(bpmMatch[1]);
          console.log('BPM found in description:', bpm);
        }
        
        const keyMatch = desc.match(/([A-G][#b]?m?)\s*(?:key|tonality)/i);
        if (keyMatch && !key) {
          key = keyMatch[1];
          console.log('Key found in description:', key);
        }
      }
      
      // Cek di title (kadang ada BPM di title)
      if (info.title && !bpm) {
        const titleBpmMatch = info.title.match(/bpm[:\s]*(\d+)/i);
        if (titleBpmMatch) {
          bpm = parseInt(titleBpmMatch[1]);
          console.log('BPM found in title:', bpm);
        }
      }
      
      // Jika tidak ada, coba extract dari file audio menggunakan music-metadata
      if ((!bpm || !key) && mm) {
        try {
          console.log('Trying to extract from audio file metadata...');
          const metadata = await mm.parseFile(absolutePath);
          console.log('Audio metadata:', {
            bpm: metadata.common.bpm,
            key: metadata.common.initialKey || metadata.common.key,
            comment: metadata.common.comment
          });
          
          // BPM dari metadata
          if (!bpm && metadata.common.bpm) {
            bpm = Math.round(metadata.common.bpm);
            console.log('BPM found in audio metadata:', bpm);
          }
          
          // Key dari metadata (biasanya di comment atau custom field)
          if (!key) {
            key = metadata.common.initialKey || 
                  metadata.common.key || 
                  (metadata.common.comment && Array.isArray(metadata.common.comment) 
                    ? metadata.common.comment.find(c => c && typeof c === 'string' && /[A-G][#b]?m?/i.test(c))?.match(/([A-G][#b]?m?)/i)?.[1]
                    : null) ||
                  null;
            if (key) {
              console.log('Key found in audio metadata:', key);
            }
          }
        } catch (mmError) {
          // music-metadata error, skip
          console.log('Error extracting metadata from audio file:', mmError.message);
        }
      }
      
      // Jika BPM masih tidak ditemukan, coba detect menggunakan analisis audio
      if (!bpm) {
        try {
          console.log('Attempting to detect BPM from audio analysis...');
          bpm = await detectBPMFromAudio(absolutePath);
          if (bpm) {
            console.log('BPM detected from audio analysis:', bpm);
          }
        } catch (bpmError) {
          console.log('Error detecting BPM from audio:', bpmError.message);
        }
      }
      
      console.log('Final BPM:', bpm, 'Key:', key);
    } catch (metaError) {
      console.log('Error extracting BPM/Key:', metaError.message);
    }
    
    // Download and embed artwork
    let artworkPath = null;
    if (info.thumbnail) {
      try {
        const artworkDir = path.join(app.getPath('userData'), 'artwork');
        if (!fs.existsSync(artworkDir)) {
          fs.mkdirSync(artworkDir, { recursive: true });
        }
        artworkPath = path.join(artworkDir, `${info.id}.jpg`);
        console.log('Downloading artwork from:', info.thumbnail);
        await downloadArtwork(info.thumbnail, artworkPath);
        console.log('Artwork downloaded successfully');
        
        // Embed artwork to audio file
        await embedArtworkToFile(absolutePath, artworkPath);
        console.log('Artwork embedded successfully');
      } catch (artworkError) {
        console.log('Error downloading/embedding artwork:', artworkError.message);
        // Continue even if artwork fails
      }
    }
    
    // Write BPM dan Key ke metadata file audio agar terbaca di Rekordbox
    try {
      await writeMetadataToFile(absolutePath, {
        bpm: bpm,
        key: key,
        title: info.title || 'Unknown',
        artist: info.uploader || info.channel || 'Unknown Artist',
        artworkPath: artworkPath
      });
      console.log('Metadata written to file successfully');
    } catch (writeError) {
      console.log('Error writing metadata to file:', writeError.message);
      // Continue even if metadata write fails
    }
    
    const trackData = {
      id: trackId,
      title: info.title || 'Unknown',
      artist: info.uploader || info.channel || 'Unknown Artist',
      duration: info.duration || 0,
        currentTime: 0,
      url: `file://${absolutePath}`,
      filePath: absolutePath,
      bpm: bpm || null,
      key: key || null
    };
    
    console.log('Returning track data:', trackData);
    return trackData;
  } catch (error) {
    console.error('Error adding SoundCloud track:', error);
    throw error;
  }
});

// Helper function to get next available ILOVEMUSIC zip filename
function getNextILoveMusicZipPath(downloadsPath) {
  let counter = 1;
  let zipPath;
  do {
    zipPath = path.join(downloadsPath, `ILOVEMUSIC(${counter}).zip`);
    counter++;
  } while (fs.existsSync(zipPath) && counter < 1000); // Prevent infinite loop
  
  return zipPath;
}

// Handler untuk download track ke folder Downloads
ipcMain.handle('soundcloud:download', async (_, trackIds, tracks) => {
  try {
    const downloadsPath = app.getPath('downloads');
    const outputDir = path.join(app.getPath('userData'), 'tracks');

    if (trackIds.length === 1) {
      // Single track download
      const track = tracks.find(t => t.id === trackIds[0]);
      if (!track || !track.filePath) {
        throw new Error('Track file not found');
      }

      const fileName = `${track.title} - ${track.artist}.mp3`.replace(/[<>:"/\\|?*]/g, '_');
      const destPath = path.join(downloadsPath, fileName);
      
      fs.copyFileSync(track.filePath, destPath);
      
      return { success: true, path: destPath };
    } else {
      // Multiple tracks - create ZIP with ILOVEMUSIC naming
      const archiver = require('archiver');
      const zipPath = getNextILoveMusicZipPath(downloadsPath);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      return new Promise((resolve, reject) => {
        archive.on('error', reject);
        output.on('close', () => resolve({ success: true, path: zipPath }));

        archive.pipe(output);

        trackIds.forEach(trackId => {
          const track = tracks.find(t => t.id === trackId);
          if (track && track.filePath && fs.existsSync(track.filePath)) {
            const fileName = `${track.title} - ${track.artist}.mp3`.replace(/[<>:"/\\|?*]/g, '_');
            archive.file(track.filePath, { name: fileName });
          }
        });

        archive.finalize();
      });
    }
  } catch (error) {
    console.error('Error downloading tracks:', error);
    throw error;
  }
});
