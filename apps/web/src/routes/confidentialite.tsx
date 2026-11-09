import { createFileRoute } from '@tanstack/react-router'
import { EDITOR, LegalPage } from '@/components/legal-page'

export const Route = createFileRoute('/confidentialite')({ component: Confidentialite })

function Confidentialite() {
  return (
    <LegalPage title="Politique de confidentialité" updated="9 novembre 2026">
      <h2>Qui est responsable ?</h2>
      <p>
        Pour les données de votre compte (clients d'Askly), le responsable de traitement est{' '}
        {EDITOR.name}, {EDITOR.status}. Pour les réponses recueillies par vos questionnaires, c'est
        vous, le client, qui êtes responsable de traitement ; Askly agit comme sous-traitant et ne
        les utilise que pour faire fonctionner le service.
      </p>

      <h2>Données traitées</h2>
      <ul>
        <li>Compte : nom, e-mail, mot de passe (stocké sous forme chiffrée irréversible).</li>
        <li>
          Abonnement : offre, statut et historique de paiement (les données de carte restent chez
          Stripe).
        </li>
        <li>Questionnaires : questions, images et paramètres que vous créez.</li>
        <li>
          Réponses : nom et e-mail des répondants que vous saisissez, messages échangés avec
          l'assistant, réponses et fichiers joints.
        </li>
        <li>Journaux techniques : adresse IP et requêtes, pour la sécurité.</li>
      </ul>

      <h2>Sous-traitants</h2>
      <ul>
        <li>OVH SAS (France) : hébergement du service, de la base de données et des fichiers.</li>
        <li>
          Anthropic PBC (États-Unis) : modèle d'IA. Les messages des répondants et le contenu du
          questionnaire lui sont envoyés pour générer les réponses de l'assistant. Ce transfert hors
          de l'Union européenne est encadré par les clauses contractuelles types de la Commission
          européenne ; Anthropic n'utilise pas ces données pour entraîner ses modèles.
        </li>
        <li>Stripe (Irlande / États-Unis) : paiement et facturation.</li>
      </ul>

      <h2>Durée de conservation</h2>
      <p>
        Les données du compte, des questionnaires et des réponses sont conservées tant que le compte
        existe, puis effacées dans les 30 jours suivant sa suppression. Vous pouvez supprimer un
        répondant ou un questionnaire à tout moment. Les pièces comptables sont conservées 10 ans,
        comme la loi l'exige. Les journaux techniques sont conservés 12 mois au plus.
      </p>

      <h2>Vos droits</h2>
      <p>
        Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation,
        d'opposition et de portabilité. Écrivez à{' '}
        <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a>. Un répondant qui souhaite exercer ses
        droits s'adresse en priorité à la personne qui lui a envoyé le questionnaire ; nous l'y
        aiderons. Vous pouvez aussi saisir la CNIL (cnil.fr).
      </p>

      <h2>Cookies</h2>
      <p>
        Askly n'utilise qu'un cookie de session, nécessaire à la connexion. Aucun cookie
        publicitaire ni de mesure d'audience.
      </p>
    </LegalPage>
  )
}
