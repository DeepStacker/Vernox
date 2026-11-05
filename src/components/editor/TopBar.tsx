import { safeLocal } from '@/lib/safeStorage';
import { useRef, useCallback, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEditor } from '@/hooks/useEditor';
import { useVectorDocument } from '@/hooks/useVectorDocument';
import { getShapeById } from '@/lib/shapes';
import { exportDocumentAsSVG, exportDocumentAsDXF, exportDocumentAsPDF } from '@/lib/exportCAM';
import { Button } from '@/components/ui/button';
import {
  Undo2, Redo2, Download, ZoomIn, ZoomOut,
  FileCode, Scissors, Save, FolderOpen, Trash2,
  FileText, ShoppingBag, Sun, Moon, ArrowLeft, Store, X
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { listProjects, saveProject, loadProject, deleteProject, SavedProject } from '@/lib/projectStorage';
import { toast } from '@/hooks/use-toast';
import { useCart } from '@/lib/cartContext';
import { useTheme } from 'next-themes';

interface TopBarProps {
  onClose?: () => void;
}

export function TopBar({ onClose }: TopBarProps = {}) {
  const { state, dispatch } = useEditor();
  const { doc, canUndo, canRedo, undo, redo } = useVectorDocument();
  const { theme, setTheme } = useTheme();
  const { add, count } = useCart();
  const navigate = useNavigate();

  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projects, setProjects] = useState<SavedProject[]>([]);

  useEffect(() => {
    if (saveOpen || loadOpen) setProjects(listProjects());
  }, [saveOpen, loadOpen]);

  const handleAddToCart = () => {
    // Generate compact 1:1 metric vector SVG thumbnail for cart preview (< 4KB)
    const svgStr = exportDocumentAsSVG(doc);
    const compactSvgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgStr)}`;

    // Calculate dynamic price based on surface area and material gauge
    const areaSqM = (doc.boundary.widthMm * doc.boundary.heightMm) / 1000000;
    const basePrice = 149;
    const areaRate = doc.material.substrate === 'brass_cz108' || doc.material.substrate === 'copper_c101' ? 450 : 250;
    const unitPrice = Math.round(basePrice + areaSqM * areaRate);

    // Serialize compact VectorDocument JSON (< 20KB)
    const designJson = JSON.stringify(doc);

    // Check if user uploaded any custom reference artwork
    type RasterLayerInfo = { tracedFromRaster?: boolean; sourceImagePreview?: string };
    const customRasterLayer = doc.layers.find(l => (l as RasterLayerInfo).tracedFromRaster && (l as RasterLayerInfo).sourceImagePreview);
    const userUploadedImage = 
      doc.userUploadedImage || 
      (customRasterLayer as RasterLayerInfo | undefined)?.sourceImagePreview || 
      safeLocal.get('vernox-studio-artwork') || 
      undefined;

    const uploadedArtworkName = 
      doc.uploadedArtworkName || 
      customRasterLayer?.name || 
      safeLocal.get('vernox-studio-artwork-name') || 
      (userUploadedImage ? 'Client Custom Logo Artwork' : undefined);

    add({
      productId: 'custom-bespoke',
      productName: uploadedArtworkName ? `Bespoke Sign (${uploadedArtworkName})` : 'Bespoke Architectural Metal Sign',
      productSlug: 'custom-bespoke',
      shapeId: doc.boundary.shapeTemplateId || 'rectangle',
      sizeLabel: `${doc.boundary.widthMm}mm × ${doc.boundary.heightMm}mm`,
      widthMm: doc.boundary.widthMm,
      heightMm: doc.boundary.heightMm,
      finish: doc.material.finish,
      unitPrice,
      customDesignThumb: compactSvgDataUri,
      customDesignRef: designJson,
      userUploadedImage,
      uploadedArtworkName,
    });

    toast({
      title: 'Added Laser Design to Cart',
      description: `${doc.boundary.widthMm} × ${doc.boundary.heightMm}mm ${doc.material.substrate.replace(/_/g, ' ')} (${doc.material.thicknessMm}mm plate).`,
    });
  };

  const handleSave = () => {
    const name = projectName.trim() || `Project ${new Date().toLocaleString()}`;
    try {
      saveProject(name, state);
    } catch (err) {
      toast({ title: 'Project not saved', description: err instanceof Error ? err.message : 'Storage is unavailable.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Project saved', description: name });
    setSaveOpen(false);
    setProjectName('');
  };

  const handleLoad = (id: string) => {
    const project = loadProject(id);
    if (!project) return;
    dispatch({ type: 'LOAD_PROJECT', state: project.state });
    toast({ title: 'Project loaded', description: project.name });
    setLoadOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteProject(id);
    setProjects(listProjects());
  };

  // 1. Export 1:1 Metric Vector SVG
  const handleExportSVG = useCallback(() => {
    const svgContent = exportDocumentAsSVG(doc, { applyKerfOffset: true });
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = `vernox-cnc-toolpath-${doc.id || doc.documentId || 'design'}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    toast({
      title: 'Vector SVG Exported',
      description: '1:1 metric toolpath with 0_CUT_INTERNAL and 1_CUT_PERIMETER layers.',
    });
  }, [doc]);

  // 2. Export AutoCAD 2000 (AC1015) DXF
  const handleExportDXF = useCallback(() => {
    const dxfContent = exportDocumentAsDXF(doc);
    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const link = document.createElement('a');
    link.download = `vernox-laser-cam-${doc.id || doc.documentId || 'design'}.dxf`;
    link.href = URL.createObjectURL(blob);
    link.click();
    toast({
      title: 'AutoCAD 2000 DXF Exported',
      description: 'AC1015 closed LWPOLYLINE toolpath with topological cut ordering.',
    });
  }, [doc]);

  // 3. Export Workshop Spec Sheet PDF
  const handleExportPDF = useCallback(() => {
    const pdf = exportDocumentAsPDF(doc, {
      orderNumber: `SPEC-${Date.now().toString(36).toUpperCase()}`,
    });
    pdf.save(`vernox-workshop-spec-${doc.id || doc.documentId || 'design'}.pdf`);
    toast({
      title: 'Workshop Spec Sheet PDF Generated',
      description: 'Includes material specs, laser telemetry, scaled schematic, and QC traveler.',
    });
  }, [doc]);

  return (
    <div className="h-12 bg-card border-b border-border flex items-center px-2 sm:px-3 gap-1 sm:gap-2 flex-shrink-0 min-w-0 max-w-full overflow-hidden">
      {/* Return to Store / Atelier */}
      {onClose ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="h-8 px-2 sm:px-2.5 text-xs font-semibold gap-1 sm:gap-1.5 border-oxblood/40 hover:bg-oxblood/10 text-oxblood hover:text-oxblood-deep shadow-sm shrink-0"
          title="Return to the store"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back to Store</span>
        </Button>
      ) : (
        <Link
          to="/shop"
          className="inline-flex items-center gap-1 sm:gap-1.5 h-8 px-2 sm:px-2.5 rounded-md text-xs font-semibold border border-oxblood/40 hover:bg-oxblood/10 text-oxblood hover:text-oxblood-deep transition-colors shadow-sm shrink-0"
          title="Return to Atelier Catalog"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Back to Store</span>
        </Link>
      )}

      {/* Brand Logo (clickable home link) */}
      <Link to="/" className="flex items-center gap-1.5 sm:gap-2 hover:opacity-85 transition group shrink-0" title="Vernox Home">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center overflow-hidden shrink-0">
          <img src="/favicon.png" alt="Vernox" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col hidden sm:flex">
          <span className="text-sm font-semibold text-foreground leading-none">Vernox</span>
          <span className="text-[9px] font-mono text-muted-foreground">CAD/CAM Studio</span>
        </div>
      </Link>

      <div className="hidden sm:block h-6 w-px bg-border" />

      {/* Undo/Redo */}
      <Button
        size="icon"
        variant="ghost"
        onClick={undo}
        disabled={!canUndo}
        className="h-8 w-8 shrink-0"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={redo}
        disabled={!canRedo}
        className="h-8 w-8 shrink-0"
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </Button>

      <div className="hidden sm:block h-6 w-px bg-border" />

      {/* Theme Toggle */}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title="Toggle Theme"
      >
        <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>

      <div className="hidden sm:block h-6 w-px bg-border" />

      {/* Save Project */}
      <Button 
        size="icon" 
        variant="ghost" 
        className="h-8 w-8" 
        title="Save Project"
        onClick={() => setSaveOpen(true)}
      >
        <Save className="w-3.5 h-3.5" />
      </Button>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Project</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Save your current CAD vector design locally to continue editing later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs text-muted-foreground">Project Name</label>
            <Input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Modern Address Sign"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Project */}
      <Button 
        size="icon" 
        variant="ghost" 
        className="h-8 w-8" 
        title="Open Project"
        onClick={() => {
          setProjects(listProjects());
          setLoadOpen(true);
        }}
      >
        <FolderOpen className="w-3.5 h-3.5" />
      </Button>
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open Project</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select a previously saved CAD vector design to open in the studio.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto -mx-2 px-2">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No saved projects found.</p>
            ) : (
              <ul className="space-y-1">
                {projects.sort((a, b) => b.updatedAt - a.updatedAt).map(p => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted group"
                  >
                    <button
                      onClick={() => handleLoad(p.id)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleString()} · {(p.state.layers?.length ?? 0)} layers
                      </div>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex-1" />

      {/* CAM Export Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="text-xs gap-1 sm:gap-1.5 h-8 px-2 sm:px-2.5 shrink-0">
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CAM</span>
            <span className="sm:hidden">CAM</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={handleExportDXF} className="cursor-pointer">
            <Scissors className="w-4 h-4 mr-2 text-primary" />
            <div className="flex flex-col">
              <span className="font-medium text-xs">Laser DXF (AC1015)</span>
              <span className="text-[10px] text-muted-foreground">AutoCAD 2000 LWPOLYLINE</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleExportSVG} className="cursor-pointer">
            <FileCode className="w-4 h-4 mr-2 text-cyan-500" />
            <div className="flex flex-col">
              <span className="font-medium text-xs">1:1 Metric Vector SVG</span>
              <span className="text-[10px] text-muted-foreground">Millimeter CNC toolpath layers</span>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2 text-amber-500" />
            <div className="flex flex-col">
              <span className="font-medium text-xs">Workshop Spec Sheet</span>
              <span className="text-[10px] text-muted-foreground">PDF CAM traveler & QC sign-off</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick Link to Shop Catalog */}
      <Link
        to="/shop"
        className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-muted/60 transition shrink-0"
      >
        <Store className="w-3.5 h-3.5" /> Atelier Catalog
      </Link>

      {/* Cart Button */}
      <Link
        to="/cart"
        className="relative inline-flex items-center justify-center h-8 px-2 sm:px-2.5 rounded-md text-xs font-medium border border-border hover:bg-muted/60 text-foreground transition-colors ml-0.5 sm:ml-1 shrink-0"
        title="View Shopping Cart"
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        {count > 0 && (
          <span className="ml-1 sm:ml-1.5 bg-primary text-primary-foreground text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">
            {count}
          </span>
        )}
      </Link>

      {/* Add to Cart */}
      <Button 
        size="sm" 
        onClick={handleAddToCart}
        className="text-xs gap-1 sm:gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition ml-0.5 sm:ml-1 h-8 font-medium shadow-sm px-2.5 sm:px-3 shrink-0"
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Add to Cart</span>
        <span className="sm:hidden font-semibold">Add</span>
      </Button>

      {/* Explicit Close Studio Button when inside dialog */}
      {onClose && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-8 w-8 text-muted-foreground hover:text-foreground ml-1"
          title="Close Studio"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
