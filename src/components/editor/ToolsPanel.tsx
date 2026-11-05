import type { BoundingBox2D } from '@/lib/cadEngineTypes';
/**
 * Industrial CAD/CAM Tools Panel
 * Provides Vector Typography, Standoff Hole Placer, Image-to-Vector Tracer,
 * Layer Hierarchy Manager, and Live CAM Linter with Manufacturing Analytics.
 */

import { safeLocal } from '@/lib/safeStorage';
import { useState, useRef, useEffect } from 'react';
import { useVectorDocument } from '@/hooks/useVectorDocument';
import { StencilFontRegistry } from '@/lib/fontRegistry';
import { ImageToVectorTracer } from '@/lib/imageTracer';
import { VectorTraceModal } from './VectorTraceModal';
import { PropertiesPanel } from './PropertiesPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Type, CircleDot, Spline, Layers, Settings2, Activity,
  Upload, Eye, EyeOff, Lock, Unlock, Trash2, Copy,
  ArrowUp, ArrowDown, CheckCircle2, AlertTriangle, Wand2, ShieldAlert,
  Maximize2, Scissors, Crop, Grid, X
} from 'lucide-react';

interface ToolsPanelProps {
  initialTab?: 'tools' | 'layers' | 'properties' | 'cam';
  onClose?: () => void;
  className?: string;
}

export function ToolsPanel({ initialTab = 'tools', onClose, className }: ToolsPanelProps = {}) {
  const {
    doc,
    analytics,
    selectedLayerId,
    selectLayer,
    addTypography,
    addMountingHole,
    addFourCornerMountingHoles,
    addImageTracedPath,
    updateTransform,
    removeLayer,
    duplicateLayer,
    reorderLayer,
    setLayerVisibility,
    setLayerLocked,
    setLayerCamLayer,
  } = useVectorDocument();

  const [activeTab, setActiveTab] = useState<'tools' | 'layers' | 'properties' | 'cam'>(initialTab);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [subTool, setSubTool] = useState<'tracer' | 'typography' | 'standoffs' | 'all'>('tracer');
  const [traceModalOpen, setTraceModalOpen] = useState(false);
  const [selectedTraceFile, setSelectedTraceFile] = useState<File | null>(null);

  const handleOpenTraceModal = (file: File) => {
    const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    const hasValidType = ALLOWED_TYPES.includes(file.type.toLowerCase()) || 
      /\.(png|jpe?g|webp|svg)$/i.test(file.name);

    if (!hasValidType) {
      toast({
        title: "Unsupported File Format",
        description: "Please upload a PNG, JPEG, WebP, or SVG vector file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File Size Exceeds Limit",
        description: `Selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed size is 15MB.`,
        variant: "destructive",
      });
      return;
    }

    setSelectedTraceFile(file);
    setTraceModalOpen(true);
  };

  const handleApplyTracedVector = (pathData: string, boundsMm: BoundingBox2D, name: string, userImagePreview?: string) => {
    const layer = addImageTracedPath(pathData, boundsMm, name, userImagePreview);
    if (userImagePreview) {
      safeLocal.set('vernox-studio-artwork', userImagePreview);
      safeLocal.set('vernox-studio-artwork-name', name);
    }
    selectLayer(layer.id);
    toast({
      title: "Precision Vector Applied",
      description: `Laser toolpath placed on CAD plate with client artwork referenced.`,
    });
  };

  // Allow canvas HUD or shortcuts to focus vector tracer
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveTab('tools');
      setSubTool('tracer');
      const file = (e as CustomEvent<{ file?: File }>).detail?.file;
      if (file) handleOpenTraceModal(file);
    };
    window.addEventListener('vernox:open-tracer', handler);
    return () => window.removeEventListener('vernox:open-tracer', handler);
  }, []);

  // Typography state
  const [textInput, setTextInput] = useState('VERNOX');
  const [selectedFont, setSelectedFont] = useState('antwerp_monogram_stencil');
  const [fontSizeMm, setFontSizeMm] = useState(45);
  const [bridged, setBridged] = useState(true);
  const [bridgeWidthMm, setBridgeWidthMm] = useState(2.0);

  // Standoff state
  const [holeDiameterMm, setHoleDiameterMm] = useState(6.0);
  const [edgeOffsetMm, setEdgeOffsetMm] = useState(15.0);

  // Image to vector state
  const [isTracing, setIsTracing] = useState(false);
  const [invertTrace, setInvertTrace] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableFonts = StencilFontRegistry.getInstance().getAvailableFonts();

  // 1. Add Typography Layer (Centered safely in workpiece)
  const handleAddTypography = () => {
    if (!textInput.trim()) return;
    const estWidth = textInput.trim().length * fontSizeMm * 0.7;
    const posX = Math.max(15, Math.round((doc.boundary.widthMm - estWidth) / 2));
    const posY = Math.max(15, Math.round((doc.boundary.heightMm - fontSizeMm) / 2));
    const layer = addTypography(
      textInput.trim(),
      selectedFont,
      fontSizeMm,
      { x: posX, y: posY },
      bridged,
      bridgeWidthMm
    );
    selectLayer(layer.id);
    toast({
      title: "Typography Feature Added",
      description: `Bridged stencil text "${textInput}" placed on internal cut layer.`,
    });
  };

  // 2. Add Single Mounting Hole
  const handleAddSingleHole = () => {
    const layer = addMountingHole(
      holeDiameterMm,
      'barrel_spacer',
      { x: edgeOffsetMm, y: edgeOffsetMm },
      edgeOffsetMm
    );
    selectLayer(layer.id);
    toast({
      title: "Standoff Hole Added",
      description: `${holeDiameterMm}mm standoff hole placed.`,
    });
  };

  // 3. Auto Add 4 Corner Standoffs
  const handleAdd4CornerHoles = () => {
    addFourCornerMountingHoles(holeDiameterMm, edgeOffsetMm);
    toast({
      title: "4-Corner Standoffs Inserted",
      description: `Placed 4 × ${holeDiameterMm}mm standoff holes inset by ${edgeOffsetMm}mm.`,
    });
  };

  // 4. Image-to-Vector Tracing Logic
  const processImageFile = async (file: File) => {
    setIsTracing(true);
    toast({
      title: "Synthesizing Laser Contours",
      description: "Running Otsu binarization and Bezier curve fitting...",
    });

    let objectUrl = '';
    try {
      const img = new Image();
      objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Render to offscreen canvas to extract pixel data
      const canvas = document.createElement('canvas');
      const maxDim = 600;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not acquire canvas 2D context");

      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);

      // Invert if requested
      if (invertTrace) {
        for (let i = 0; i < imgData.data.length; i += 4) {
          imgData.data[i] = 255 - imgData.data[i];
          imgData.data[i + 1] = 255 - imgData.data[i + 1];
          imgData.data[i + 2] = 255 - imgData.data[i + 2];
        }
      }

      const result = ImageToVectorTracer.traceImage(imgData, {
        targetWidthMm: Math.min(doc.boundary.widthMm * 0.7, 180),
      });

      const userImagePreview = canvas.toDataURL('image/jpeg', 0.82);
      const artworkName = file.name.replace(/\.[^/.]+$/, '');
      safeLocal.set('vernox-studio-artwork', userImagePreview);
      safeLocal.set('vernox-studio-artwork-name', artworkName);

      const layer = addImageTracedPath(
        result.pathData,
        result.boundsMm,
        artworkName,
        userImagePreview
      );
      selectLayer(layer.id);

      toast({
        title: "Vector Toolpath Generated",
        description: `Extracted ${result.contours.length} contours. Ready for laser cut.`,
      });
    } catch (err: unknown) {
      console.error("Vector trace error:", err);
      toast({
        title: "Tracing Failed",
        description: (err instanceof Error && err.message) || "Failed to extract vector contours from image.",
        variant: "destructive",
      });
    } finally {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // Revoking an already-released object URL is harmless.
        }
      }
      setIsTracing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleOpenTraceModal(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleOpenTraceModal(file);
    }
  };

  // Instant Sample Motif Vectorizer
  const handleTraceSample = (type: 'monogram' | 'crest' | 'sunburst') => {
    setIsTracing(true);
    toast({
      title: "Synthesizing Studio Motif",
      description: `Vectorizing ${type} silhouette into closed Bezier laser toolpath...`,
    });

    setTimeout(() => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not acquire 2D canvas context");

        // Crisp White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 400, 400);

        // Solid Black silhouette
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';

        if (type === 'monogram') {
          // Antwerp 'V' Monogram with chevron
          ctx.beginPath();
          ctx.moveTo(90, 80);
          ctx.lineTo(155, 80);
          ctx.lineTo(200, 245);
          ctx.lineTo(245, 80);
          ctx.lineTo(310, 80);
          ctx.lineTo(235, 325);
          ctx.lineTo(165, 325);
          ctx.closePath();
          ctx.fill();

          // Inner negative space cut
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(200, 160, 24, 0, Math.PI * 2);
          ctx.fill();
        } else if (type === 'crest') {
          // Architectural Shield Crest
          ctx.beginPath();
          ctx.moveTo(200, 55);
          ctx.lineTo(325, 105);
          ctx.lineTo(325, 230);
          ctx.bezierCurveTo(325, 315, 200, 355, 200, 355);
          ctx.bezierCurveTo(200, 355, 75, 315, 75, 230);
          ctx.lineTo(75, 105);
          ctx.closePath();
          ctx.fill();

          // Cutout Cross in center
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(185, 115, 30, 150);
          ctx.fillRect(125, 165, 150, 30);
        } else {
          // Geometric 8-point Sunburst Star
          ctx.beginPath();
          const cx = 200, cy = 200, outerR = 145, innerR = 65;
          for (let i = 0; i < 16; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const angle = (i * Math.PI) / 8 - Math.PI / 2;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();

          // Center circular cutout
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(200, 200, 30, 0, Math.PI * 2);
          ctx.fill();
        }

        const imgData = ctx.getImageData(0, 0, 400, 400);
        if (invertTrace) {
          for (let i = 0; i < imgData.data.length; i += 4) {
            imgData.data[i] = 255 - imgData.data[i];
            imgData.data[i + 1] = 255 - imgData.data[i + 1];
            imgData.data[i + 2] = 255 - imgData.data[i + 2];
          }
        }

        const result = ImageToVectorTracer.traceImage(imgData, {
          targetWidthMm: Math.min(doc.boundary.widthMm * 0.65, 160),
        });

        const layer = addImageTracedPath(
          result.pathData,
          result.boundsMm,
          `Atelier ${type.charAt(0).toUpperCase() + type.slice(1)}`
        );
        selectLayer(layer.id);

        toast({
          title: "Motif Vectorized",
          description: `Extracted ${result.contours.length} closed Bezier paths ready for cutting.`,
        });
      } catch (err: unknown) {
        toast({
          title: "Tracing Error",
          description: (err instanceof Error && err.message) || "Failed to generate sample vector.",
          variant: "destructive",
        });
      } finally {
        setIsTracing(false);
      }
    }, 120);
  };

  // Open Crop Studio with a 12-logo collage sample to test freehand & box cropping
  const handleOpenSampleCollage = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clean background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 640, 480);

      // Draw 4x3 collage grid
      const cols = 4;
      const rows = 3;
      const cellW = 640 / cols;
      const cellH = 480 / rows;
      const symbols = ['♠', '♥', '♦', '♣', '★', '◆', '❖', '⬡', '⚓', '⚜', '✦', '▲'];
      const names = ['ACES', 'ROYAL', 'SHIELD', 'CLUB', 'STELLA', 'BOLT', 'FLORA', 'HEXA', 'MARINA', 'CREST', 'AURA', 'DELTA'];

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const cx = c * cellW + cellW / 2;
          const cy = r * cellH + cellH / 2 - 8;

          // Box border
          ctx.strokeStyle = '#D1C7B7';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(c * cellW + 8, r * cellH + 8, cellW - 16, cellH - 16);

          // Dark logo icon
          ctx.fillStyle = '#1B1412';
          ctx.font = 'bold 36px serif';
          ctx.fillText(symbols[idx % symbols.length], cx, cy);

          // Name label
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(names[idx % names.length], cx, cy + 28);
        }
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'Sample_12_Logo_Collage_Sheet.png', { type: 'image/png' });
          handleOpenTraceModal(file);
          toast({
            title: "Collage Sheet Loaded in Studio",
            description: "Try Freehand Lasso or Normal Box Cropping to isolate any of the 12 logos!",
          });
        }
      }, 'image/png');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={cn("w-full md:w-[350px] lg:w-[360px] flex-shrink-0 md:border-l border-border bg-card flex flex-col h-full min-h-0 min-w-0 flex-1", className)}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex flex-col h-full min-h-0 flex-1">
        {/* Navigation Tabs Header */}
        <div className="p-2 border-b border-border bg-card flex items-center gap-1.5 flex-shrink-0">
          <TabsList className="grid grid-cols-4 flex-1 h-9 bg-muted/60 p-0.5">
            <TabsTrigger value="tools" className="text-[11px] gap-1 px-1">
              <Wand2 className="w-3.5 h-3.5" />
              <span>Tools</span>
            </TabsTrigger>
            <TabsTrigger value="layers" className="text-[11px] gap-1 px-1">
              <Layers className="w-3.5 h-3.5" />
              <span>Layers</span>
            </TabsTrigger>
            <TabsTrigger value="properties" className="text-[11px] gap-1 px-1">
              <Settings2 className="w-3.5 h-3.5" />
              <span>Inspect</span>
            </TabsTrigger>
            <TabsTrigger value="cam" className="text-[11px] gap-1 px-1 relative">
              <Activity className="w-3.5 h-3.5" />
              <span>CAM</span>
              {!analytics.isValidated && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </TabsTrigger>
          </TabsList>
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 md:hidden"
              title="Close Panel"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Tab 1: Vector CAD Tools */}
        {activeTab === 'tools' && (
          <TabsContent value="tools" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
          {/* Subtool Segmented Switcher - Instant zero-scroll access */}
          <div className="px-3 py-2 border-b border-border/70 bg-muted/20 flex-shrink-0">
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-background/90 rounded-lg border border-border/80 shadow-2xs">
              <button
                type="button"
                onClick={() => setSubTool('tracer')}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                  subTool === 'tracer'
                    ? "bg-burgundy text-cream shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                title="Image to Laser Vector Tracer"
              >
                <Spline className="w-3 h-3 shrink-0" />
                <span className="truncate">Trace</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTool('typography')}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                  subTool === 'typography'
                    ? "bg-burgundy text-cream shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                title="Laser Stencil Typography"
              >
                <Type className="w-3 h-3 shrink-0" />
                <span className="truncate">Text</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTool('standoffs')}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                  subTool === 'standoffs'
                    ? "bg-burgundy text-cream shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                title="Mounting Standoff Holes"
              >
                <CircleDot className="w-3 h-3 shrink-0" />
                <span className="truncate">Mounts</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTool('all')}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-medium transition-all cursor-pointer",
                  subTool === 'all'
                    ? "bg-burgundy text-cream shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                title="View All CAD Tools in Stream"
              >
                <Layers className="w-3 h-3 shrink-0" />
                <span className="truncate">All</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
            <div className="p-3.5 space-y-4 pb-28 md:pb-6">
              {/* 1. Image-to-Vector Tracer (Otsu + Bezier) - RENDERED FIRST */}
              {(subTool === 'tracer' || subTool === 'all') && (
                <div className="rounded-lg border border-border/80 bg-gradient-to-b from-card via-card to-muted/20 p-3.5 shadow-sm space-y-3">
                  {/* Header with Luxury Brand Badge */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[4px] bg-burgundy/10 border border-burgundy/25 flex items-center justify-center text-burgundy shadow-2xs">
                        <Spline className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-dark-brown font-brand">
                          Image to Laser Vector
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-sans">
                          Raster Silhouette → Mathematical 3.0mm Kerf
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full bg-burgundy/10 text-burgundy font-semibold border border-burgundy/20">
                      Otsu · Bezier
                    </span>
                  </div>

                  {/* Subtitle & Precision Chips */}
                  <p className="text-[11px] text-muted-foreground leading-relaxed font-sans">
                    Trace logos, coats of arms, and silhouettes into closed mathematical Bezier contours with zero pixel artifacts.
                  </p>

                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-[3px] bg-background/90 border border-border/70 text-[9px] font-mono text-dark-brown/80 font-medium">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Closed Loop</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-[3px] bg-background/90 border border-border/70 text-[9px] font-mono text-dark-brown/80 font-medium">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Zero Bitmaps</span>
                    </div>
                    <div className="flex items-center justify-center gap-1 py-1 px-1.5 rounded-[3px] bg-background/90 border border-border/70 text-[9px] font-mono text-dark-brown/80 font-medium">
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Laser CAM</span>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Interactive Drag & Drop Area */}
                  <div
                    onClick={() => !isTracing && fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "group relative border-2 border-dashed rounded-md p-3.5 text-center transition-all duration-300 select-none",
                      isTracing
                        ? "border-burgundy/60 bg-burgundy/5 cursor-wait"
                        : isDragging
                        ? "border-burgundy bg-burgundy/10 scale-[1.01] shadow-soft cursor-copy"
                        : "border-border/80 bg-background/70 hover:border-burgundy/60 hover:bg-muted/40 hover:shadow-xs cursor-pointer"
                    )}
                  >
                    {isTracing ? (
                      <div className="py-2 space-y-2">
                        <div className="relative w-8 h-8 mx-auto">
                          <div className="w-8 h-8 rounded-full border-2 border-burgundy/30 border-t-burgundy animate-spin" />
                          <Spline className="w-3.5 h-3.5 text-burgundy absolute inset-0 m-auto animate-pulse" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-burgundy">
                            Synthesizing Laser Toolpath...
                          </p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            Otsu Binarization → Moore Contour → Schneider Beziers
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="w-8 h-8 rounded-full bg-burgundy/10 border border-burgundy/20 text-burgundy mx-auto flex items-center justify-center group-hover:scale-110 group-hover:bg-burgundy group-hover:text-cream transition-all duration-300 shadow-2xs">
                          <Upload className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-dark-brown group-hover:text-burgundy transition-colors">
                            Upload & Trace Vector Contour
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Drop PNG, JPG, SVG, WebP or click to open Freehand / Box Cropping
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[9px] text-muted-foreground/70 font-mono tracking-wider pt-1 border-t border-border/50">
                          <span>Freehand Lasso</span>
                          <span>·</span>
                          <span>Box Crop</span>
                          <span>·</span>
                          <span>Collage Grid</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dedicated Crop Studio Launch Buttons */}
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      onClick={() => {
                        if (selectedTraceFile) {
                          setTraceModalOpen(true);
                        } else {
                          fileInputRef.current?.click();
                        }
                      }}
                      className="w-full h-8 text-xs font-semibold bg-burgundy hover:bg-burgundy-hover text-cream shadow-xs gap-1.5"
                    >
                      <Scissors className="w-3.5 h-3.5 text-dusty-pink" />
                      Open Freehand & Box Crop Studio
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenSampleCollage}
                      className="w-full h-7 text-[11px] font-medium border-border/80 hover:bg-muted/60 text-dark-brown gap-1.5 shadow-2xs"
                    >
                      <Grid className="w-3.5 h-3.5 text-burgundy" />
                      Test 12-Logo Collage with Lasso & Box Crop
                    </Button>
                  </div>

                  {/* Invert Polarity Toggle with Clear Context */}
                  <div className="flex items-center justify-between p-2.5 rounded-md bg-background/80 border border-border/70 shadow-2xs">
                    <div className="space-y-0.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs font-semibold text-dark-brown cursor-pointer">
                          Invert Threshold
                        </Label>
                        <span className={cn(
                          "text-[9px] font-mono px-1.5 py-0.2 rounded font-medium",
                          invertTrace ? "bg-burgundy/10 text-burgundy" : "bg-muted text-muted-foreground"
                        )}>
                          {invertTrace ? "Light on Dark" : "Dark on Light"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">
                        Flip polarity if artwork has light silhouette on dark canvas
                      </p>
                    </div>
                    <Switch checked={invertTrace} onCheckedChange={setInvertTrace} />
                  </div>

                  {/* Instant Studio Presets for One-Click Test */}
                  <div className="pt-0.5">
                    <div className="flex items-center justify-between text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1.5">
                      <span>Or Try Studio Silhouette Motifs</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleTraceSample('monogram')}
                        disabled={isTracing}
                        className="px-2 py-1.5 text-[10px] font-sans font-medium rounded border border-border/80 bg-background/80 hover:bg-burgundy hover:text-cream hover:border-burgundy text-dark-brown transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Generate bespoke monogram silhouette"
                      >
                        <span>Monogram V</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTraceSample('crest')}
                        disabled={isTracing}
                        className="px-2 py-1.5 text-[10px] font-sans font-medium rounded border border-border/80 bg-background/80 hover:bg-burgundy hover:text-cream hover:border-burgundy text-dark-brown transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Generate heraldic shield motif"
                      >
                        <span>Shield Crest</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTraceSample('sunburst')}
                        disabled={isTracing}
                        className="px-2 py-1.5 text-[10px] font-sans font-medium rounded border border-border/80 bg-background/80 hover:bg-burgundy hover:text-cream hover:border-burgundy text-dark-brown transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Generate geometric sunburst motif"
                      >
                        <span>Sunburst Star</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Laser Stencil Typography Tool */}
              {(subTool === 'typography' || subTool === 'all') && (
                <div className="rounded-lg border border-border/80 bg-gradient-to-b from-card via-card to-muted/20 p-3.5 shadow-sm space-y-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[4px] bg-burgundy/10 border border-burgundy/25 flex items-center justify-center text-burgundy shadow-2xs">
                        <Type className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-dark-brown font-brand">
                          Laser Stencil Typography
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-sans">
                          Bridged internal cut paths for plate fallout prevention
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full bg-burgundy/10 text-burgundy font-semibold border border-burgundy/20">
                      CAD Font
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Text String</Label>
                      <Input
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        placeholder="e.g. 42 HIGH ST"
                        className="h-8 text-xs font-semibold mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Laser Stencil Font</Label>
                      <Select value={selectedFont} onValueChange={setSelectedFont}>
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFonts.map(f => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Font Size</span>
                        <span className="font-mono font-medium text-dark-brown">{fontSizeMm} mm</span>
                      </div>
                      <Slider
                        value={[fontSizeMm]}
                        min={15}
                        max={120}
                        step={1}
                        onValueChange={([val]) => setFontSizeMm(val)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-md bg-background/80 border border-border/70 shadow-2xs">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-semibold text-dark-brown">Stencil Bridges</Label>
                        <p className="text-[10px] text-muted-foreground">Laser fallout prevention tab</p>
                      </div>
                      <Switch checked={bridged} onCheckedChange={setBridged} />
                    </div>

                    <Button
                      onClick={handleAddTypography}
                      className="w-full h-8 text-xs font-semibold gap-1.5 mt-2 bg-burgundy hover:bg-burgundy-hover text-cream shadow-xs"
                    >
                      <Type className="w-3.5 h-3.5 text-dusty-pink" />
                      Insert Stencil Text
                    </Button>
                  </div>
                </div>
              )}

              {/* 3. Mounting Standoff Hole Placer */}
              {(subTool === 'standoffs' || subTool === 'all') && (
                <div className="rounded-lg border border-border/80 bg-gradient-to-b from-card via-card to-muted/20 p-3.5 shadow-sm space-y-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[4px] bg-burgundy/10 border border-burgundy/25 flex items-center justify-center text-burgundy shadow-2xs">
                        <CircleDot className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-dark-brown font-brand">
                          Mounting Standoffs
                        </h3>
                        <p className="text-[10px] text-muted-foreground font-sans">
                          Precision holes for 20mm architectural wall barrels
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono tracking-widest px-2 py-0.5 rounded-full bg-burgundy/10 text-burgundy font-semibold border border-burgundy/20">
                      Mounts
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Hole Diameter</span>
                        <span className="font-mono font-medium text-dark-brown">{holeDiameterMm} mm</span>
                      </div>
                      <Slider
                        value={[holeDiameterMm]}
                        min={3}
                        max={16}
                        step={0.5}
                        onValueChange={([val]) => setHoleDiameterMm(val)}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Corner Edge Inset</span>
                        <span className="font-mono font-medium text-dark-brown">{edgeOffsetMm} mm</span>
                      </div>
                      <Slider
                        value={[edgeOffsetMm]}
                        min={8}
                        max={40}
                        step={1}
                        onValueChange={([val]) => setEdgeOffsetMm(val)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        variant="outline"
                        onClick={handleAddSingleHole}
                        className="h-8 text-xs font-medium border-border/80 hover:bg-muted/60"
                      >
                        + Single Hole
                      </Button>
                      <Button
                        onClick={handleAdd4CornerHoles}
                        className="h-8 text-xs font-semibold bg-burgundy hover:bg-burgundy-hover text-cream shadow-xs"
                      >
                        4 Corners Auto
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
        )}

        {/* Tab 2: Layers Hierarchy */}
        {activeTab === 'layers' && (
        <TabsContent value="layers" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
            <div className="p-3 space-y-2 pb-28 md:pb-6">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Feature Layers ({doc.layers.length})
                </span>
              </div>

              {doc.layers.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  No features added yet.<br />Use Tools tab to add typography or holes.
                </div>
              ) : (
                doc.layers.map((layer, idx) => {
                  const isSelected = selectedLayerId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      onClick={() => selectLayer(layer.id)}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border text-xs transition-all cursor-pointer group",
                        isSelected
                          ? "bg-primary/10 border-primary text-foreground font-medium shadow-sm"
                          : "bg-background/60 border-border hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {layer.type === 'typography' && <Type className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        {layer.type === 'mounting_hole' && <CircleDot className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        {layer.type === 'vector_path' && <Spline className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        <span className="truncate text-xs font-medium block" title={layer.name}>
                          {layer.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderLayer(layer.id, 'up');
                          }}
                          disabled={idx === doc.layers.length - 1}
                          className="p-1 rounded hover:bg-muted hover:text-foreground disabled:opacity-25 transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderLayer(layer.id, 'down');
                          }}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-muted hover:text-foreground disabled:opacity-25 transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLayerVisibility(layer.id, !layer.visible);
                          }}
                          className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors"
                          title={layer.visible ? "Hide Layer" : "Show Layer"}
                        >
                          {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLayer(layer.id);
                            if (selectedLayerId === layer.id) selectLayer(null);
                          }}
                          className="p-1 rounded hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors"
                          title="Delete Layer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </TabsContent>
        )}

        {/* Tab 3: Inspect Properties */}
        {activeTab === 'properties' && (
        <TabsContent value="properties" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
            <div className="p-4 pb-28 md:pb-6">
              <PropertiesPanel />
            </div>
          </div>
        </TabsContent>
        )}

        {/* Tab 4: CAM Linter & Analytics */}
        {activeTab === 'cam' && (
        <TabsContent value="cam" className="flex-1 min-h-0 m-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
            <div className="p-4 space-y-5 pb-28 md:pb-6">
              {/* Feasibility Alert Card */}
              <div className={cn(
                "p-3 rounded-lg border flex items-start gap-2.5",
                analytics.isValidated
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                  : "bg-amber-950/40 border-amber-500/30 text-amber-300"
              )}>
                {analytics.isValidated ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <h4 className="text-xs font-semibold">
                    {analytics.isValidated ? "100% Laser Cutting Feasible" : "Manufacturing Warnings Found"}
                  </h4>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    {analytics.isValidated
                      ? "All contours closed, kerf clearances validated, and structural stencil bridges verified."
                      : "The active design violates one or more CNC cutting rules. Review issues below before cutting."}
                  </p>
                </div>
              </div>

              {/* Validation Issues List */}
              {analytics.validationIssues && analytics.validationIssues.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Violations ({analytics.validationIssues.length})
                  </Label>
                  <div className="space-y-2">
                    {analytics.validationIssues.map((issue, idx) => {
                      const targetLayer = issue.layerId ? doc.layers.find(l => l.id === issue.layerId) : null;
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-2.5 rounded-md border text-xs space-y-1.5",
                            issue.severity === 'error'
                              ? "bg-destructive/10 border-destructive/30 text-destructive-foreground"
                              : "bg-amber-950/20 border-amber-500/30 text-amber-200"
                          )}
                        >
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
                            <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                            <span>[{issue.ruleId}]</span>
                          </div>
                          <p className="text-[11px] leading-tight text-foreground/90">
                            {issue.message}
                          </p>

                          {/* Quick-Fix for CAM-01: Convert to Vector Score (Etch) */}
                          {issue.ruleId === 'CAM-01' && targetLayer && targetLayer.type === 'vector_path' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1.5 mt-1 border-primary/40 hover:bg-primary/20 text-primary w-full justify-center font-medium"
                              onClick={() => {
                                setLayerCamLayer(targetLayer.id, '2_VECTOR_SCORE');
                                selectLayer(targetLayer.id);
                                toast({
                                  title: "Converted to Surface Score/Etch",
                                  description: `Layer "${targetLayer.name}" will be surface-scored. Fallout risk eliminated.`,
                                });
                              }}
                            >
                              <Wand2 className="w-3 h-3 text-primary" />
                              Convert to Vector Score (Surface Etch)
                            </Button>
                          )}

                          {/* Quick-Fix for CAM-04: Auto-Center in Safe Zone */}
                          {issue.ruleId === 'CAM-04' && targetLayer && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1.5 mt-1 border-amber-500/40 hover:bg-amber-500/20 text-amber-300 w-full justify-center font-medium"
                              onClick={() => {
                                const w = targetLayer.type === 'typography'
                                  ? (targetLayer.rawText?.length || 1) * targetLayer.fontSizeMm * 0.7
                                  : targetLayer.type === 'vector_path'
                                  ? targetLayer.boundsMm?.widthMm || 50
                                  : targetLayer.type === 'mounting_hole'
                                  ? targetLayer.diameterMm
                                  : targetLayer.widthMm;
                                const h = targetLayer.type === 'typography'
                                  ? targetLayer.fontSizeMm
                                  : targetLayer.type === 'vector_path'
                                  ? targetLayer.boundsMm?.heightMm || 50
                                  : targetLayer.type === 'mounting_hole'
                                  ? targetLayer.diameterMm
                                  : targetLayer.heightMm;
                                const newX = Math.max(15, Math.round((doc.boundary.widthMm - w) / 2));
                                const newY = Math.max(15, Math.round((doc.boundary.heightMm - h) / 2));
                                updateTransform(targetLayer.id, { xMm: newX, yMm: newY });
                                selectLayer(targetLayer.id);
                                toast({
                                  title: "Auto-Centered Feature",
                                  description: `Layer "${targetLayer.name}" safely positioned inside plate margins.`,
                                });
                              }}
                            >
                              <Maximize2 className="w-3 h-3 text-amber-300" />
                              Auto-Center in Safe Zone
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manufacturing Metrics Table */}
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Laser Machine Telemetry
                </Label>
                <div className="rounded-lg border border-border bg-background/50 overflow-hidden divide-y divide-border text-xs">
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Machine Process</span>
                    <span className="font-semibold">3kW Fiber Laser</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Total Cut Length</span>
                    <span className="font-mono font-semibold">
                      {analytics.totalCutLengthMm.toFixed(1)} mm ({(analytics.totalCutLengthMm / 1000).toFixed(2)} m)
                    </span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Pierce Count</span>
                    <span className="font-mono font-semibold">{analytics.totalPierceCount} pierces</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Est. Laser Runtime</span>
                    <span className="font-mono font-semibold">{analytics.estimatedCutTimeSec.toFixed(1)} s</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Finished Part Mass</span>
                    <span className="font-mono font-semibold">{analytics.partWeightKg.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Calibrated Kerf Offset</span>
                    <span className="font-mono font-semibold">{doc.material.activeGaugeParams.kerfWidthMm} mm</span>
                  </div>
                  <div className="flex justify-between p-2.5">
                    <span className="text-muted-foreground">Assist Gas</span>
                    <span className="font-semibold">High-Pressure N₂</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        )}
      </Tabs>

      {/* Interactive Vector Trace & Crop Studio Dialog */}
      <VectorTraceModal
        open={traceModalOpen}
        onOpenChange={setTraceModalOpen}
        imageFile={selectedTraceFile}
        workpieceWidthMm={doc.boundary.widthMm}
        onApplyVector={handleApplyTracedVector}
      />
    </div>
  );
}

