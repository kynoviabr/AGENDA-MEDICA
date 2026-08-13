import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface BrandingData {
  clinicId: string | null;
  clinicName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  primaryContrast: string;
  loading: boolean;
}

const defaultBranding: BrandingData = {
  clinicId: null,
  clinicName: 'Kynovia',
  logoUrl: null,
  primaryColor: '#1a7a6d',
  secondaryColor: '#f5f0e8',
  accentColor: '#c8912e',
  primaryContrast: '#ffffff',
  loading: true,
};

const BrandingContext = createContext<BrandingData>(defaultBranding);

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 174, s: 58, l: 28 };

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function getLuminance(hex: string): number {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 0;
  const [r, g, b] = [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function applyBrandingCss(primary: string, secondary: string, accent: string) {
  const root = document.documentElement;
  const p = hexToHsl(primary);
  const s = hexToHsl(secondary);
  const a = hexToHsl(accent);

  root.style.setProperty('--brand-primary', `${p.h} ${p.s}% ${p.l}%`);
  root.style.setProperty('--brand-secondary', `${s.h} ${s.s}% ${s.l}%`);
  root.style.setProperty('--brand-accent', `${a.h} ${a.s}% ${a.l}%`);
  root.style.setProperty('--brand-primary-contrast', getLuminance(primary) > 0.5 ? '#000000' : '#ffffff');

  // Override design system tokens with brand colors
  root.style.setProperty('--primary', `${p.h} ${p.s}% ${p.l}%`);
  root.style.setProperty('--ring', `${p.h} ${p.s}% ${p.l}%`);
  root.style.setProperty('--accent', `${a.h} ${a.s}% ${a.l}%`);
  root.style.setProperty('--sidebar-primary', `${p.h} ${p.s}% ${p.l}%`);

  // Stripe-style: also override the purple-* family + primary-light/dark so chips,
  // hover states and focus rings stay coherent with the clinic brand.
  root.style.setProperty('--color-purple', `${p.h} ${p.s}% ${p.l}%`);
  root.style.setProperty('--color-purple-dark', `${p.h} ${p.s}% ${Math.max(p.l - 10, 0)}%`);
  root.style.setProperty('--color-purple-light', `${p.h} ${Math.min(p.s + 10, 100)}% 95%`);
  root.style.setProperty('--primary-dark', `${p.h} ${p.s}% ${Math.max(p.l - 10, 0)}%`);
  root.style.setProperty('--primary-light', `${p.h} ${Math.min(p.s + 10, 100)}% 95%`);

  // Stripe focus ring tinted with the clinic brand
  root.style.setProperty('--shadow-focus', `0 0 0 3px hsl(${p.h} ${p.s}% ${p.l}% / 0.18)`);
  root.style.setProperty('--shadow-glow', `0 8px 24px hsl(${p.h} ${p.s}% ${p.l}% / 0.18)`);

  // Update gradients (hero/marketing only)
  root.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${p.h} ${p.s}% ${p.l}%), hsl(${p.h} ${p.s}% ${Math.max(p.l - 10, 0)}%))`);
  root.style.setProperty('--gradient-accent', `linear-gradient(135deg, hsl(${a.h} ${a.s}% ${a.l}%), hsl(${Math.max(a.h - 8, 0)} ${Math.min(a.s + 10, 100)}% ${Math.max(a.l - 5, 0)}%))`);
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<BrandingData>(defaultBranding);

  useEffect(() => {
    if (!user) {
      setBranding({ ...defaultBranding, loading: false });
      return;
    }

    const fetchBranding = async () => {
      // Try to get clinic from user_roles first (staff)
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('clinic_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      let clinicId = roleData?.clinic_id;

      // If not staff, try patient app access
      if (!clinicId) {
        const { data: portalData } = await supabase
          .from('patient_users' as unknown)
          .select('clinic_id')
          .eq('auth_user_id', user.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        clinicId = (portalData as unknown)?.clinic_id;
      }

      if (!clinicId) {
        setBranding({ ...defaultBranding, loading: false });
        return;
      }

      const { data: clinic } = await supabase
        .from('clinics')
        .select('id, name, logo_url, primary_color, secondary_color, accent_color')
        .eq('id', clinicId)
        .maybeSingle();

      if (clinic) {
        const primary = clinic.primary_color || '#1a7a6d';
        const secondary = clinic.secondary_color || '#f5f0e8';
        const accentColor = clinic.accent_color || '#c8912e';

        applyBrandingCss(primary, secondary, accentColor);

        setBranding({
          clinicId: clinic.id,
          clinicName: clinic.name,
          logoUrl: clinic.logo_url,
          primaryColor: primary,
          secondaryColor: secondary,
          accentColor: accentColor,
          primaryContrast: getLuminance(primary) > 0.5 ? '#000000' : '#ffffff',
          loading: false,
        });
      } else {
        setBranding({ ...defaultBranding, loading: false });
      }
    };

    fetchBranding();
  }, [user]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
