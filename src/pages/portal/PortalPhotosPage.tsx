import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const typeLabels: Record<string, string> = { before: 'Antes', during: 'Durante', after: 'Depois', progress: 'Progresso' };
const typeColors: Record<string, string> = { before: 'bg-blue-100 text-blue-700', during: 'bg-yellow-100 text-yellow-700', after: 'bg-green-100 text-green-700', progress: 'bg-purple-100 text-purple-700' };

export default function PortalPhotosPage() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewPhoto, setViewPhoto] = useState<unknown>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: portal } = await supabase.from('patient_users' as unknown)
        .select('patient_id').eq('auth_user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
      if (!portal) { setLoading(false); return; }
      const { data } = await supabase.from('patient_photos').select('*').eq('patient_id', portal.patient_id).order('taken_at', { ascending: false });
      setPhotos(data || []);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-foreground">Minhas Fotos</h2>
      {photos.length === 0 ? (
        <Card className="shadow-card"><CardContent className="py-12 text-center">
          <Camera className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhuma foto registrada</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map(p => (
            <Card key={p.id} className="shadow-card overflow-hidden cursor-pointer" onClick={() => setViewPhoto(p)}>
              <div className="relative aspect-square">
                <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                <Badge className={`absolute top-2 left-2 text-xs ${typeColors[p.photo_type]}`}>{typeLabels[p.photo_type]}</Badge>
              </div>
              <CardContent className="p-2">
                <p className="text-xs text-muted-foreground">{format(new Date(p.taken_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!viewPhoto} onOpenChange={() => setViewPhoto(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{viewPhoto?.description || 'Foto'}</DialogTitle></DialogHeader>
          {viewPhoto && <img src={viewPhoto.photo_url} alt="" className="w-full rounded-xl" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
