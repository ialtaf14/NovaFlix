import React, { useState, useRef, useEffect } from 'react';
import './ImageUploadModal.css';

export default function ImageUploadModal({ isOpen, onClose, onUpload, type }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setImageSrc(null);
      setZoom(1);
      setRotation(0);
      setPanX(0);
      setPanY(0);
      setError('');
    }
  }, [isOpen]);

  const drawCanvas = () => {
    if (!imageSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      const targetWidth = type === 'cover' ? 1200 : type === 'story' ? 450 : 400;
      const targetHeight = type === 'cover' ? 400 : type === 'story' ? 800 : 400;
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);
      
      const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
      const x = -(img.width / 2) * scale;
      const y = -(img.height / 2) * scale;
      
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      ctx.restore();
    };
  };

  useEffect(() => {
    if (imageSrc) drawCanvas();
  }, [imageSrc, zoom, rotation, panX, panY]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }
    
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setError('Only image and video formats are supported');
      return;
    }

    setError('');
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageSrc(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange({ target: { files: [e.dataTransfer.files[0]] } });
    }
  };

  const handleSave = async () => {
    if (!imageSrc) return;
    setUploading(true);
    try {
      let dataToUpload = imageSrc;
      if (selectedFile && selectedFile.type.startsWith('image/')) {
        if (canvasRef.current) {
          dataToUpload = canvasRef.current.toDataURL('image/jpeg', 0.85);
        }
      }
      await onUpload(dataToUpload, type);
      onClose();
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handlePointerDown = (e) => {
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - panX, y: clientY - panY });
  };
  
  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setPanX(clientX - dragStart.x);
    setPanY(clientY - dragStart.y);
  };
  
  const handlePointerUp = () => setIsDragging(false);

  const isVideoFile = selectedFile && selectedFile.type.startsWith('video/');

  return (
    <div className="upload-modal-overlay">
      <div className="upload-modal-content">
        <h2>{type === 'cover' ? 'Change Cover Photo' : type === 'story' ? 'Select Story Media' : 'Change Profile Photo'}</h2>
        
        {!imageSrc ? (
          <div 
            className="upload-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload').click()}
          >
            <span>📁 Drag & Drop photo/video here or Click to Select</span>
            <input 
              id="file-upload" 
              type="file" 
              accept="image/*,video/*" 
              style={{ display: 'none' }} 
              onChange={handleFileChange} 
            />
          </div>
        ) : (
          <div className="upload-editor">
            <div className="upload-preview-container">
              {isVideoFile ? (
                <video 
                  src={imageSrc} 
                  controls 
                  autoPlay 
                  loop 
                  muted 
                  style={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: '400px',
                    borderRadius: '8px',
                    objectFit: 'cover'
                  }} 
                />
              ) : (
                <canvas 
                  ref={canvasRef} 
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                  style={{ 
                    width: '100%', 
                    height: 'auto', 
                    maxHeight: '400px', 
                    borderRadius: (type === 'cover' || type === 'story') ? '8px' : '50%',
                    objectFit: 'cover',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none'
                  }} 
                />
              )}
            </div>
            
            {!isVideoFile && (
              <div className="upload-controls">
                <div className="control-group">
                  <label>Zoom ({Math.round(zoom * 100)}%)</label>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="3" 
                    step="0.05" 
                    value={zoom} 
                    onChange={(e) => setZoom(parseFloat(e.target.value))} 
                  />
                </div>
                <div className="control-group">
                  <label>Rotate ({rotation}°)</label>
                  <input 
                    type="range" 
                    min="-180" 
                    max="180" 
                    value={rotation} 
                    onChange={(e) => setRotation(parseInt(e.target.value))} 
                  />
                </div>
              </div>
            )}
            
            <button className="upload-remove-btn" onClick={() => {
              setImageSrc(null);
              setSelectedFile(null);
              setZoom(1);
              setRotation(0);
              setPanX(0);
              setPanY(0);
            }}>
              Remove / Choose Another
            </button>
          </div>
        )}

        {error && <div className="upload-error">{error}</div>}

        <div className="upload-modal-actions">
          <button className="upload-cancel-btn" onClick={onClose} disabled={uploading}>Cancel</button>
          {imageSrc && (
            <button className="upload-save-btn" onClick={handleSave} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Save & Upload'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
