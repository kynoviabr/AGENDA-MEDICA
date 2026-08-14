import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import ClinicLayout from "./components/layouts/ClinicLayout";
import PatientPortalLayout from "./components/layouts/PatientPortalLayout";
import ClinicDashboard from "./pages/clinic/DashboardPage";
import CrmPage from "./pages/clinic/CrmPage";
import PatientsPage from "./pages/clinic/PatientsPage";
import PatientDetailPage from "./pages/clinic/PatientDetailPage";
import TreatmentsPage from "./pages/clinic/TreatmentsPage";
import AppointmentsPage from "./pages/clinic/AppointmentsPage";
import ReportsPage from "./pages/clinic/ReportsPage";
import SettingsPage from "./pages/clinic/SettingsPage";
import WhatsAppAiPage from "./pages/clinic/WhatsAppAiPage";
import PortalHomePage from "./pages/portal/PortalHomePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BrandingProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              } />

              {/* Clinic internal — staff only */}
              <Route path="/clinic" element={
                <ProtectedRoute allowedRoles={['admin', 'receptionist', 'professional', 'sales']}>
                  <ClinicLayout />
                </ProtectedRoute>
              }>
                <Route index element={<ClinicDashboard />} />
                <Route path="crm" element={<CrmPage />} />
                <Route path="whatsapp-ai" element={<WhatsAppAiPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/:id" element={<PatientDetailPage />} />
                <Route path="treatments" element={<TreatmentsPage readOnly />} />
                <Route path="appointments" element={<AppointmentsPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />

                {/*
                  MVP legado preservado, porém desativado nesta fase do produto.
                  O wildcard impede acesso direto sem excluir as implementações.
                  Consulte README.md > "Módulos MVP desativados".
                */}
                <Route path="proposals/*" element={<Navigate to="/clinic" replace />} />
                <Route path="contracts/*" element={<Navigate to="/clinic" replace />} />
                <Route path="payments/*" element={<Navigate to="/clinic" replace />} />
                <Route path="finance/contracts/*" element={<Navigate to="/clinic" replace />} />
                <Route path="metas/*" element={<Navigate to="/clinic" replace />} />
                <Route path="sessions/*" element={<Navigate to="/clinic" replace />} />
                <Route path="evolution/*" element={<Navigate to="/clinic" replace />} />
                <Route path="photos/*" element={<Navigate to="/clinic" replace />} />
                <Route path="feedback/*" element={<Navigate to="/clinic" replace />} />
                <Route path="nps/*" element={<Navigate to="/clinic" replace />} />
                <Route path="satisfaction/*" element={<Navigate to="/clinic" replace />} />
              </Route>

              {/* Patient portal */}
              <Route path="/portal" element={
                <ProtectedRoute allowedRoles={['patient']}>
                  <PatientPortalLayout />
                </ProtectedRoute>
              }>
                <Route index element={<PortalHomePage />} />
                {/* Contrato, pagamentos e jornada clínica do portal também permanecem como MVP desativado. */}
                <Route path="contract/*" element={<Navigate to="/portal" replace />} />
                <Route path="payments/*" element={<Navigate to="/portal" replace />} />
                <Route path="sessions/*" element={<Navigate to="/portal" replace />} />
                <Route path="evolution/*" element={<Navigate to="/portal" replace />} />
                <Route path="photos/*" element={<Navigate to="/portal" replace />} />
                <Route path="feedback/*" element={<Navigate to="/portal" replace />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrandingProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
