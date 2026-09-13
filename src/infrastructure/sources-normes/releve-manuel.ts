import type { ReleveNorme, SourceNormes } from '../../application/ports/source-normes'

/**
 * La source par défaut : le relevé que l'économiste a constitué lui-même, à
 * partir de sa documentation, de son abonnement, ou du catalogue consulté à la
 * main.
 *
 * Elle ne consulte rien : elle rend ce qu'on lui a donné. C'est volontaire —
 * voir la note du port sur ce qui est légalement récupérable et ce qui ne l'est
 * pas. Une source qui prétendrait faire mieux mentirait.
 */
export class ReleveManuel implements SourceNormes {
  readonly id = 'releve-manuel'
  readonly libelle = 'Relevé tenu par l’économiste'
  readonly automatique = false

  constructor(private readonly releves: readonly ReleveNorme[] = []) {}

  async consulter(references: readonly string[]): Promise<ReleveNorme[]> {
    const demandees = new Set(references)
    return this.releves.filter((releve) => demandees.has(releve.reference))
  }
}
