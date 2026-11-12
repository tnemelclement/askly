import { createFileRoute, Link } from '@tanstack/react-router'
import { EDITOR, LegalPage } from '@/components/legal-page'

export const Route = createFileRoute('/cgv')({ component: Cgv })

function Cgv() {
  return (
    <LegalPage title="Conditions générales de vente et d'utilisation" updated="12 novembre 2026">
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions régissent l'accès au service hébergé Askly (askly.tnemelc.fr),
        édité par {EDITOR.name} ({EDITOR.status}), qui permet de créer des questionnaires
        conversationnels et d'en recueillir les réponses. Créer un compte vaut acceptation de ces
        conditions.
      </p>

      <h2>2. Offres et prix</h2>
      <ul>
        <li>
          Solo : 9 € par mois, 50 réponses par mois, sans questions « fichier » ni serveur MCP.
        </li>
        <li>Pro : 29 € par mois, 500 réponses par mois, fichiers joints et serveur MCP.</li>
      </ul>
      <p>
        Une réponse correspond à une personne qui commence un questionnaire au cours du mois.
        Au-delà du quota, les nouveaux questionnaires ne peuvent plus être commencés jusqu'au mois
        suivant ou jusqu'au passage à une offre supérieure ; les réponses déjà commencées ne sont
        pas affectées.
      </p>
      <p>
        Prix en euros, toutes taxes comprises (TVA française de 20 % incluse). Numéro de TVA
        intracommunautaire de l'éditeur : {EDITOR.vat}.
      </p>

      <h2>3. Essai gratuit</h2>
      <p>
        Chaque nouveau compte bénéficie d'un essai gratuit de 14 jours, sans carte bancaire, avec
        toutes les fonctions et 20 réponses. À la fin de l'essai, le compte reste accessible en
        lecture ; il faut souscrire une offre pour recueillir de nouvelles réponses.
      </p>

      <h2>4. Abonnement, paiement et résiliation</h2>
      <p>
        L'abonnement est mensuel, sans engagement, payable d'avance par carte via Stripe. Il se
        renouvelle automatiquement chaque mois. Vous pouvez le résilier à tout moment depuis votre
        compte : la résiliation prend effet à la fin de la période déjà payée, sans remboursement au
        prorata. Un changement d'offre s'applique immédiatement, au prorata.
      </p>

      <h2>5. Droit de rétractation</h2>
      <p>
        Si vous êtes un consommateur, vous disposez d'un délai de 14 jours à compter de la
        souscription pour vous rétracter (article L221-18 du Code de la consommation), en écrivant à{' '}
        <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a>. En demandant l'accès immédiat au
        service, vous acceptez qu'il commence avant la fin de ce délai ; en cas de rétractation, le
        montant correspondant au service déjà fourni reste dû (article L221-25). Les professionnels
        ne bénéficient pas de ce droit.
      </p>

      <h2>6. Utilisation du service</h2>
      <p>
        Vous êtes responsable du contenu de vos questionnaires, des personnes que vous invitez et du
        respect de la réglementation sur les données personnelles vis-à-vis d'elles. Sont interdits
        : les contenus illicites, l'hameçonnage, la collecte de données bancaires ou de mots de
        passe, et tout usage visant à détourner l'assistant IA de sa fonction. L'éditeur peut
        suspendre un compte qui enfreint ces règles.
      </p>

      <h2>7. Vos données</h2>
      <p>
        Les questionnaires et les réponses recueillies vous appartiennent. Vous pouvez les exporter
        à tout moment (CSV ou JSON). À la suppression du compte, ils sont effacés dans un délai de
        30 jours. Le traitement des données personnelles est décrit dans la{' '}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>8. Disponibilité et responsabilité</h2>
      <p>
        Le service est fourni en l'état, avec une obligation de moyens : l'éditeur fait de son mieux
        pour qu'il soit disponible et sauvegardé, sans garantie de disponibilité continue. Les
        réponses de l'assistant sont générées par une IA et peuvent être imparfaites ; les réponses
        retenues restent visibles et corrigeables par le répondant avant envoi. La responsabilité de
        l'éditeur est limitée aux sommes payées au cours des 12 derniers mois et exclut les dommages
        indirects.
      </p>

      <h2>9. Modification des conditions</h2>
      <p>
        Toute modification est annoncée par e-mail au moins 30 jours à l'avance ; vous pouvez
        résilier avant son entrée en vigueur.
      </p>

      <h2>10. Droit applicable</h2>
      <p>
        Ces conditions sont soumises au droit français. En cas de litige, une solution amiable est
        recherchée d'abord ; un consommateur peut recourir gratuitement à un médiateur de la
        consommation (TODO : nom et site du médiateur, une fois l'adhésion faite), après une
        réclamation écrite restée sans solution. À défaut, les tribunaux français sont compétents.
      </p>
    </LegalPage>
  )
}
