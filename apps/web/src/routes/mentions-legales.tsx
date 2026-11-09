import { createFileRoute } from '@tanstack/react-router'
import { EDITOR, LegalPage } from '@/components/legal-page'

export const Route = createFileRoute('/mentions-legales')({ component: MentionsLegales })

function MentionsLegales() {
  return (
    <LegalPage title="Mentions légales" updated="9 novembre 2026">
      <h2>Éditeur</h2>
      <ul>
        <li>
          {EDITOR.name}, {EDITOR.status}
        </li>
        <li>SIRET : {EDITOR.siret}</li>
        <li>Adresse : {EDITOR.address}</li>
        <li>
          Contact : <a href={`mailto:${EDITOR.email}`}>{EDITOR.email}</a>
        </li>
        <li>Directeur de la publication : {EDITOR.name}</li>
      </ul>

      <h2>Hébergement</h2>
      <p>OVH SAS, 2 rue Kellermann, 59100 Roubaix, France (ovhcloud.com).</p>

      <h2>Logiciel</h2>
      <p>
        Askly est un logiciel libre publié sous licence MIT. Son code source est disponible sur{' '}
        <a href="https://github.com/tnemelclement/askly">GitHub</a>. Le service hébergé sur
        askly.tnemelc.fr est exploité par l'éditeur ci-dessus.
      </p>
    </LegalPage>
  )
}
