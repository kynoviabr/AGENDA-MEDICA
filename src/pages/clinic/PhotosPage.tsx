import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Camera, ZoomIn, ArrowLeftRight, Upload, Loader2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const typeLabels: Record<string, string> = { before: 'Antes', during: 'Durante', after: 'Depois', progress: 'Progresso' };
const typeColors: Record<string, string> = { before: 'bg-blue-100 text-blue-700', during: 'bg-yellow-100 text-yellow-700', after: 'bg-green-100 text-green-700', progress: 'bg-purple-100 text-purple-700' };

export default function PhotosPage() {
  const { user } = useAuth();
  const { clinicId } = useUserRole();
  const [photos, setPhotos] = useState<unknown[]>([]);
  const [patients, setPatients] = useState<unknown[]>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [viewPhoto, setViewPhoto] = useState<unknown>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePhotos, setComparePhotos] = useState<unknown[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<string>('progress');
  const [uploadDesc, setUploadDesc] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clinicId) return;
    supabase.from('patients').select('id, full_name').eq('clinic_id', clinicId).eq('status', 'active')
      .then(({ data }) => { if (data) setPatients(data); });
  }, [clinicId]);

  const fetchPhotos = useCallback(async () => {
    if (!clinicId || !selectedPatient) { setPhotos([]); setLoading(false); return; }
    setLoading(true);
    let q = supabase.from('patient_photos').select('*').eq('clinic_id', clinicId).eq('patient_id', selectedPatient).order('taken_at', { ascending: false });
    if (filterType !== 'all') q = q.eq('photo_type', filterType as unknown);
    const { data } = await q;
    setPhotos(data || []);
    setLoading(false);
  }, [clinicId, selectedPatient, filterType]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  const handleUpload = async () => {
    if (!clinicId || !selectedPatient || !user || selectedFiles.length === 0) return;
    setUploading(true);

    try {
      for (const file of selectedFiles) {
        const ext = file.name.split('.').pop();
        const path = `${clinicId}/${selectedPatient}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: storageError } = await supabase.storage
          .from('patient-photos')
          .upload(path, file, { contentType: file.type });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage
          .from('patient-photos')
          .getPublicUrl(path);

        const { error: dbError } = await supabase.from('patient_photos').insert({
          clinic_id: clinicId,
          patient_id: selectedPatient,
          photo_url: publicUrl,
          photo_type: uploadType as unknown,
          description: uploadDesc || null,
          uploaded_by: user.id,
        });

        if (dbError) throw dbError;
      }

      toast.success(`${selectedFiles.length} foto(s) enviada(s) com sucesso`);
      setUploadOpen(false);
      setSelectedFiles([]);
      setUploadDesc('');
      fetchPhotos();
    } catch (err: unknown) {
      toast.error(err.message || 'Erro ao enviar foto');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: unknown) => {
    if (!confirm('Deseja realmente excluir esta foto?')) return;

    try {
      // Extract storage path from URL
      const url = new URL(photo.photo_url);
      const pathParts = url.pathname.split('/patient-photos/');
      if (pathParts[1]) {
        await supabase.storage.from('patient-photos').remove([decodeURIComponent(pathParts[1])]);
      }

      const { error } = await supabase.from('patient_photos').delete().eq('id', photo.id);
      if (error) throw error;

      toast.success('Foto excluída');
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      setViewPhoto(null);
    } catch (err: unknown) {
      toast.error(err.message || 'Erro ao excluir');
    }
  };

  const toggleCompare = (photo: unknown) => {
    if (comparePhotos.find(p => p.id === photo.id)) {
      setComparePhotos(comparePhotos.filter(p => p.id !== photo.id));
    } else if (comparePhotos.length < 2) {
      setComparePhotos([...comparePhotos, photo]);
    }
  };

  return (
    <div>
      <PageHeader title="Fotos" description="Registro fotográfico e comparador antes/depois">
        <div className="flex gap-2">
          <Button variant={compareMode ? 'default' : 'outline'} onClick={() => { setCompareMode(!compareMode); setComparePhotos([]); }}>
            <ArrowLeftRight className="w-4 h-4 mr-2" />{compareMode ? 'Cancelar' : 'Comparar'}
          </Button>
          {selectedPatient && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />Enviar Fotos
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2">
          <Select value={selectedPatient} onValueChange={v => { setSelectedPatient(v); setComparePhotos([]); }}>
            <SelectTrigger><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
            <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="before">Antes</SelectItem>
              <SelectItem value="during">Durante</SelectItem>
              <SelectItem value="after">Depois</SelectItem>
              <SelectItem value="progress">Progresso</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Compare view */}
      {compareMode && comparePhotos.length === 2 && (
        <Card className="shadow-card mb-6">
          <CardContent className="p-4">
            <h3 className="font-semibold text-foreground mb-3 text-center">Comparação</h3>
            <div className="grid grid-cols-2 gap-4">
              {comparePhotos.map(p => (
                <div key={p.id} className="text-center">
                  <img src={p.photo_url} alt="" className="w-full rounded-xl object-cover aspect-square mb-2" />
                  <Badge className={typeColors[p.photo_type]}>{typeLabels[p.photo_type]}</Badge>
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(p.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedPatient ? (
        <Card className="shadow-card"><CardContent className="py-16 text-center">
          <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Selecione um paciente para ver as fotos</p>
        </CardContent></Card>
      ) : photos.length === 0 && !loading ? (
        <Card className="shadow-card"><CardContent className="py-16 text-center">
          <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhuma foto registrada</p>
          <Button variant="outline" className="mt-4" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />Enviar primeira foto
          </Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(photo => (
            <Card key={photo.id} className={`shadow-card overflow-hidden cursor-pointer transition-all hover:shadow-card-hover ${compareMode && comparePhotos.find(p => p.id === photo.id) ? 'ring-2 ring-primary' : ''}`}
              onClick={() => compareMode ? toggleCompare(photo) : setViewPhoto(photo)}>
              <div className="relative aspect-square">
                <img src={photo.photo_url} alt={photo.description || ''} className="w-full h-full object-cover" />
                <Badge className={`absolute top-2 left-2 text-xs ${typeColors[photo.photo_type]}`}>{typeLabels[photo.photo_type]}</Badge>
              </div>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{format(new Date(photo.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                {photo.description && <p className="text-xs text-foreground mt-1 truncate">{photo.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View photo dialog */}
      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{viewPhoto?.description || 'Foto'}</DialogTitle></DialogHeader>
          {viewPhoto && (
            <>
              <img src={viewPhoto.photo_url} alt="" className="w-full rounded-xl" />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <Badge className={typeColors[viewPhoto.photo_type]}>{typeLabels[viewPhoto.photo_type]}</Badge>
                  <span className="text-sm text-muted-foreground">{format(new Date(viewPhoto.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(viewPhoto)}>
                  <Trash2 className="w-4 h-4 mr-1" />Excluir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar Fotos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo da foto</Label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="before">Antes</SelectItem>
                  <SelectItem value="during">Durante</SelectItem>
                  <SelectItem value="after">Depois</SelectItem>
                  <SelectItem value="progress">Progresso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="Ex: Região abdominal — sessão 3" />
            </div>
            <div>
              <Label>Fotos</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  const valid = files.filter(f => f.size <= 10 * 1024 * 1024);
                  if (valid.length < files.length) toast.error('Arquivos acima de 10MB foram ignorados');
                  setSelectedFiles(valid);
                }}
              />
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Clique ou arraste para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP — até 10MB cada</p>
              </div>
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={uploading || selectedFiles.length === 0}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Enviar {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
