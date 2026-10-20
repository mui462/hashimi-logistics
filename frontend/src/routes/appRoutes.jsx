import AdminLayout from '../layouts/AdminLayout';
import AuthLayout from '../layouts/AuthLayout';
import CarrierLayout from '../layouts/CarrierLayout';
import CustomerLayout from '../layouts/CustomerLayout';
import PublicLayout from '../layouts/PublicLayout';
import RootLayout from '../layouts/RootLayout';
import AdminLoginPage from '../pages/auth/AdminLoginPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import LoginPage from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';
import VerifyEmailPage from '../pages/auth/VerifyEmailPage';
import LoadingState from '../components/common/LoadingState';
import RouteErrorPage from '../pages/public/RouteErrorPage';
import { adminRoutes } from './definitions/adminRoutes';
import { carrierRoutes } from './definitions/carrierRoutes';
import { customerRoutes } from './definitions/customerRoutes';
import { publicRoutes } from './definitions/publicRoutes';
import CarrierRoute from './CarrierRoute';
import CustomerRoute from './CustomerRoute';
import GuestRoute from './GuestRoute';
import SuperAdminRoute from './SuperAdminRoute';

const guestAuthRoutes = [
  { path: 'login', element: <LoginPage /> },
  { path: 'register', element: <RegisterPage /> },
  { path: 'admin/login', element: <AdminLoginPage /> },
];

const openAuthRoutes = [
  { path: 'forgot-password', element: <ForgotPasswordPage /> },
  { path: 'reset-password', element: <ResetPasswordPage /> },
  { path: 'verify-email', element: <VerifyEmailPage /> },
];

export const appRoutes = [
  {
    element: <RootLayout />,
    HydrateFallback: () => <LoadingState label="Loading" fullPage />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <PublicLayout />, children: publicRoutes },
      {
        element: <AuthLayout />,
        children: [{ element: <GuestRoute />, children: guestAuthRoutes }, ...openAuthRoutes],
      },
      {
        path: 'customer',
        element: <CustomerRoute />,
        children: [{ element: <CustomerLayout />, children: customerRoutes }],
      },
      {
        path: 'carrier',
        element: <CarrierRoute />,
        children: [{ element: <CarrierLayout />, children: carrierRoutes }],
      },
      {
        path: 'admin',
        element: <SuperAdminRoute />,
        children: [{ element: <AdminLayout />, children: adminRoutes }],
      },
    ],
  },
];
