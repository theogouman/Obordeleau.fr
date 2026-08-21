import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/admin/LoginForm';
import { adminReady, readAdminSession } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (await readAdminSession()) redirect('/admin');

  return (
    <main className="admin-login">
      <div className="admin-login-card">
        <p className="admin-login-eyebrow">Obordeleau</p>
        <h1 className="admin-login-title">Console</h1>
        <p className="admin-login-lead">
          Les prix, les saisons et le calendrier du studio. Réservé à la propriétaire.
        </p>

        {adminReady ? (
          <LoginForm />
        ) : (
          <p className="admin-note admin-note-warn">
            La console n&rsquo;est pas encore configurée sur ce déploiement. Il manque
            <code> SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> ou
            <code> ADMIN_SESSION_SECRET</code>.
          </p>
        )}
      </div>
    </main>
  );
}
