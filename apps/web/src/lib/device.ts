/**
 * Pointeur précis (souris, pavé) : on peut alors donner le focus au champ de saisie et
 * envoyer avec Entrée. Au doigt, le focus ouvrirait le clavier par-dessus le fil, et Entrée
 * doit aller à la ligne comme dans les messageries.
 */
export const hasFinePointer = () => window.matchMedia('(pointer: fine)').matches
