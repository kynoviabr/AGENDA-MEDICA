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
import ProposalsPage from "./pages/clinic/ProposalsPage";
import ContractsPage from "./pages/clinic/ContractsPage";
import PaymentsPage from "./pages/clinic/PaymentsPage";
import FinanceContractsPage from "./pages/clinic/FinanceContractsPage";
import AppointmentsPage from "./pages/clinic/AppointmentsPage";
import SessionsPage from "./pages/clinic/SessionsPage";
import FeedbackPage from "./pages/clinic/FeedbackPage";
import EvolutionPage from "./pages/clinic/EvolutionPage";
import PhotosPage from "./pages/clinic/PhotosPage";
import ReportsPage from "./pages/clinic/ReportsPage";
import SettingsPage from "./pages/clinic/SettingsPage";
import WhatsAppAiPage from "./pages/clinic/WhatsAppAiPage";
import GoalsTrackingPage from "./pages/clinic/GoalsTrackingPage";
import NpsPage from "./pages/clinic/NpsPage";
import SatisfactionPage from "./pages/clinic/SatisfactionPage";
import PortalHomePage from "./pages/portal/PortalHomePage";
import PortalContractPage from "./pages/portal/PortalContractPage";
import PortalPaymentsPage from "./pages/portal/PortalPaymentsPage";
import PortalSessionsPage from "./pages/portal/PortalSessionsPage";
import PortalEvolutionPage from "./pages/portal/PortalEvolutionPage";
import PortalPhotosPage from "./pages/portal/PortalPhotosPage";
import PortalFeedbackPage from "./pages/portal/PortalFeedbackPage";
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
                <Route path="proposals" element={<ProposalsPage />} />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="finance/contracts" element={<FinanceContractsPage />} />
                <Route path="appointments" element={<AppointmentsPage />} />
                <Route path="sessions" element={<SessionsPage />} />
                <Route path="evolution" element={<EvolutionPage />} />
                <Route path="photos" element={<PhotosPage />} />
                <Route path="feedback" element={<FeedbackPage />} />
                <Route path="nps" element={<NpsPage />} />
                <Route path="satisfaction" element={<SatisfactionPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="metas/acompanhamento" element={<GoalsTrackingPage />} />
                <Route path="metas/minha-meta" element={<GoalsTrackingPage />} />
                <Route path="metas/equipe" element={<GoalsTrackingPage />} />
              </Route>

              {/* Patient portal */}
              <Route path="/portal" element={
                <ProtectedRoute allowedRoles={['patient']}>
                  <PatientPortalLayout />
                </ProtectedRoute>
              }>
                <Route index element={<PortalHomePage />} />
                <Route path="contract" element={<PortalContractPage />} />
                <Route path="payments" element={<PortalPaymentsPage />} />
                <Route path="sessions" element={<PortalSessionsPage />} />
                <Route path="evolution" element={<PortalEvolutionPage />} />
                <Route path="photos" element={<PortalPhotosPage />} />
                <Route path="feedback" element={<PortalFeedbackPage />} />
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
