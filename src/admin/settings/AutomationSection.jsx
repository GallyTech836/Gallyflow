import { Info, Check, ToggleRight, ToggleLeft } from 'lucide-react';

export default function AutomationSection({
  whatsappSettings,
  setWhatsappSettings,
  automationLogs,
  toggleWhatsAppConnection,
  handleTestTriggerMessage,
}) {
  return (
    <div className="space-y-6 animate-fadeIn">

      <div className="p-4 bg-nexus-primary-soft border border-nexus-primary/20 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-nexus-primary shrink-0 mt-0.5" />
        <div className="text-xs text-nexus-text-secondary space-y-1">
          <h5 className="font-extrabold text-nexus-text">Arquitectura Preparada para Railway & WhatsApp Web API</h5>
          <p>Esta sección expone los modelos de datos preparados en Firestore. Tu futuro backend de Node.js o Python alojado en Railway podrá consultar de forma periódica las colecciones <code>reservations</code> y <code>whatsapp_settings</code> para emitir mensajes reales.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="space-y-5 lg:col-span-1">
          <div className="bg-nexus-surface border border-nexus-border rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">Servicio de Conexión</h4>
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono ${
                whatsappSettings.isConnected ? 'bg-nexus-success-bg text-nexus-success-text' : 'bg-nexus-error-bg text-nexus-error-text'
              }`}>
                {whatsappSettings.isConnected ? 'Conectado (Mock)' : 'Desconectado'}
              </span>
            </div>

            <div className="p-4 bg-nexus-background border border-nexus-border rounded-xl text-center space-y-4">
              {whatsappSettings.isConnected ? (
                <div className="space-y-2">
                  <div className="w-16 h-16 rounded-full bg-nexus-success-bg border-2 border-nexus-success mx-auto flex items-center justify-center text-nexus-success">
                    <Check className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-bold text-nexus-text">Bot de Mensajería Listo</p>
                  <p className="text-[10px] text-nexus-text-muted font-mono">Última sinc: {new Date(whatsappSettings.lastSync).toLocaleTimeString()}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-32 h-32 bg-white p-2 mx-auto rounded-lg flex items-center justify-center">
                    <div className="w-full h-full bg-nexus-text flex items-center justify-center text-white text-[9px] font-bold font-mono text-center leading-tight">
                      [ QR CODE <br/> SIMULATOR ]
                    </div>
                  </div>
                  <p className="text-xs text-nexus-text-secondary">Escanee el código QR desde su celular para emparejar el canal de WhatsApp.</p>
                </div>
              )}

              <button
                type="button"
                onClick={toggleWhatsAppConnection}
                className={`w-full py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  whatsappSettings.isConnected
                    ? 'bg-nexus-error-bg text-nexus-error-text border border-nexus-error/20 hover:opacity-80'
                    : 'bg-nexus-success hover:opacity-90 text-white shadow-md'
                }`}
              >
                {whatsappSettings.isConnected ? 'Desconectar WhatsApp' : 'Simular Escaneo de QR'}
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <h5 className="text-[10px] text-nexus-text-muted font-bold uppercase tracking-wider font-mono">Disparadores del Bot</h5>

              <div className="flex items-center justify-between p-2 bg-nexus-background border border-nexus-border rounded-lg">
                <span className="text-xs text-nexus-text-secondary">Confirmación al reservar</span>
                <button
                  type="button"
                  onClick={() => setWhatsappSettings(prev => ({ ...prev, autoConfirmationEnabled: !prev.autoConfirmationEnabled }))}
                  className="text-nexus-text-muted hover:text-nexus-text"
                >
                  {whatsappSettings.autoConfirmationEnabled ? (
                    <ToggleRight className="w-7 h-7 text-nexus-success" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-nexus-border" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 bg-nexus-background border border-nexus-border rounded-lg">
                <span className="text-xs text-nexus-text-secondary">Recordatorio previo (24h)</span>
                <button
                  type="button"
                  onClick={() => setWhatsappSettings(prev => ({ ...prev, autoReminderEnabled: !prev.autoReminderEnabled }))}
                  className="text-nexus-text-muted hover:text-nexus-text"
                >
                  {whatsappSettings.autoReminderEnabled ? (
                    <ToggleRight className="w-7 h-7 text-nexus-success" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-nexus-border" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 bg-nexus-background border border-nexus-border rounded-lg">
                <span className="text-xs text-nexus-text-secondary">Notificación al cancelar</span>
                <button
                  type="button"
                  onClick={() => setWhatsappSettings(prev => ({ ...prev, autoCancellationEnabled: !prev.autoCancellationEnabled }))}
                  className="text-nexus-text-muted hover:text-nexus-text"
                >
                  {whatsappSettings.autoCancellationEnabled ? (
                    <ToggleRight className="w-7 h-7 text-nexus-success" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-nexus-border" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 bg-nexus-background border border-nexus-border rounded-lg">
                <span className="text-xs text-nexus-text-secondary">Agradecimiento post-servicio</span>
                <button
                  type="button"
                  onClick={() => setWhatsappSettings(prev => ({ ...prev, autoThankYouEnabled: !prev.autoThankYouEnabled }))}
                  className="text-nexus-text-muted hover:text-nexus-text"
                >
                  {whatsappSettings.autoThankYouEnabled ? (
                    <ToggleRight className="w-7 h-7 text-nexus-success" />
                  ) : (
                    <ToggleLeft className="w-7 h-7 text-nexus-border" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">

          <div className="bg-nexus-surface border border-nexus-border rounded-xl p-5 shadow-lg space-y-4">
            <div className="flex justify-between items-center border-b border-nexus-border pb-3">
              <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">Estructura de Mensajes (Templates)</h4>
              <button
                type="button"
                onClick={handleTestTriggerMessage}
                className="px-2.5 py-1 bg-nexus-primary-soft text-nexus-primary border border-nexus-primary/25 text-[10px] rounded font-mono font-bold hover:opacity-80"
              >
                Probar Envío de Prueba
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] text-nexus-primary font-bold block uppercase tracking-widest font-mono">Confirmación de Cita</label>
                <textarea
                  rows="3"
                  value={whatsappSettings.messageTemplates.confirmation}
                  onChange={(e) => setWhatsappSettings(prev => ({
                    ...prev,
                    messageTemplates: { ...prev.messageTemplates, confirmation: e.target.value }
                  }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-sans resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-nexus-primary font-bold block uppercase tracking-widest font-mono">Recordatorio Cita (24H)</label>
                <textarea
                  rows="3"
                  value={whatsappSettings.messageTemplates.reminder}
                  onChange={(e) => setWhatsappSettings(prev => ({
                    ...prev,
                    messageTemplates: { ...prev.messageTemplates, reminder: e.target.value }
                  }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-sans resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-nexus-primary font-bold block uppercase tracking-widest font-mono">Aviso de Cancelación</label>
                <textarea
                  rows="3"
                  value={whatsappSettings.messageTemplates.cancellation}
                  onChange={(e) => setWhatsappSettings(prev => ({
                    ...prev,
                    messageTemplates: { ...prev.messageTemplates, cancellation: e.target.value }
                  }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-sans resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-nexus-primary font-bold block uppercase tracking-widest font-mono">Agradecimiento Final</label>
                <textarea
                  rows="3"
                  value={whatsappSettings.messageTemplates.thankYou}
                  onChange={(e) => setWhatsappSettings(prev => ({
                    ...prev,
                    messageTemplates: { ...prev.messageTemplates, thankYou: e.target.value }
                  }))}
                  className="w-full bg-nexus-background border border-nexus-border rounded-lg p-2.5 text-xs text-nexus-text outline-none focus:border-nexus-primary font-sans resize-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-nexus-surface border border-nexus-border rounded-xl p-5 shadow-lg space-y-4">
            <h4 className="text-xs font-bold text-nexus-text uppercase tracking-wider font-mono">Cola de Eventos Recientes (Logs)</h4>
            <div className="overflow-x-auto max-h-56 rounded-lg border border-nexus-border bg-nexus-background">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-nexus-border bg-nexus-surface-hover text-[9px] text-nexus-text-secondary uppercase tracking-widest font-mono">
                    <th className="py-2 px-3">Cita</th>
                    <th className="py-2 px-3">Destinatario</th>
                    <th className="py-2 px-3">Mensaje</th>
                    <th className="py-2 px-3 text-center">Estado</th>
                    <th className="py-2 px-3 text-right">Fecha Registro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nexus-border font-mono text-[10px]">
                  {automationLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-nexus-surface-hover transition-colors">
                      <td className="py-2 px-3 text-nexus-primary font-bold">#{log.reservationId}</td>
                      <td className="py-2 px-3 font-sans text-nexus-text-secondary font-semibold">{log.phone}</td>
                      <td className="py-2 px-3 text-nexus-text-muted uppercase">{log.type}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase font-mono ${
                          log.status === 'sent' ? 'bg-nexus-success-bg text-nexus-success-text' : 'bg-nexus-error-bg text-nexus-error-text'
                        }`}>
                          {log.status === 'sent' ? 'Enviado' : 'Fallido'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-nexus-text-muted">{new Date(log.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                  {automationLogs.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-nexus-text-muted">Sin eventos todavía.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}