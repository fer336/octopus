import { describe, it, expect } from 'vitest'
import { descriptionToGroupCode, buildGroupSuggestions } from '../../utils/similarityGroup'

describe('descriptionToGroupCode', () => {
  it('generates a code from a basic description', () => {
    expect(descriptionToGroupCode('Canilla 3/4 pulgada')).toBe('CANILLA-34')
  })

  it('strips accents', () => {
    expect(descriptionToGroupCode('Caño PVC')).toBe('CANO-PVC')
    expect(descriptionToGroupCode('Válvula esférica')).toBe('VALVULA-ESFERICA')
    expect(descriptionToGroupCode('Pintura látex')).toBe('PINTURA-LATEX')
  })

  it('removes stopwords', () => {
    expect(descriptionToGroupCode('de la Canilla')).toBe('CANILLA')
    expect(descriptionToGroupCode('Pintura de látex')).toBe('PINTURA-LATEX')
    expect(descriptionToGroupCode('Tubo para agua')).toBe('TUBO-AGUA')
  })

  it('removes slashes turning fractions into numbers', () => {
    expect(descriptionToGroupCode('Tornillo 1/2 pulgada')).toBe('TORNILLO-12')
    expect(descriptionToGroupCode('Caño 3/4 PVC')).toBe('CANO-34')
  })

  it('limits to the first 2 meaningful tokens', () => {
    expect(descriptionToGroupCode('Pintura látex blanca interior premium')).toBe('PINTURA-LATEX')
  })

  it('limits total length to 20 characters', () => {
    const result = descriptionToGroupCode('Tornillo hexagonal galvanizado')
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('uppercases the result', () => {
    const result = descriptionToGroupCode('pintura latex')
    expect(result).toBe(result.toUpperCase())
  })

  it('returns empty string for empty input', () => {
    expect(descriptionToGroupCode('')).toBe('')
  })

  it('returns empty string when all tokens are stopwords', () => {
    expect(descriptionToGroupCode('de el la por')).toBe('')
  })

  it('filters tokens shorter than 2 characters', () => {
    // 'B' has length 1 → filtered; 'A' is also a stopword → filtered
    expect(descriptionToGroupCode('Canilla B tipo')).toBe('CANILLA-TIPO')
  })

  it('is deterministic — same input always produces same output', () => {
    const desc = 'Caño PVC 1/2 rígido'
    expect(descriptionToGroupCode(desc)).toBe(descriptionToGroupCode(desc))
  })

  it('produces consistent codes for equivalent descriptions across products', () => {
    // Two products with the same core words should get the same suggested code
    const code1 = descriptionToGroupCode('Canilla 3/4 Ferrum')
    const code2 = descriptionToGroupCode('Canilla 3/4 FV')
    expect(code1).toBe(code2)
  })
})

describe('buildGroupSuggestions', () => {
  it('places the generated code first', () => {
    const suggestions = buildGroupSuggestions([], null, 'CANILLA-34')
    expect(suggestions[0]).toBe('CANILLA-34')
  })

  it('includes existing codes from products in the results', () => {
    const products = [
      { id: 'p1', similarity_group_code: 'EXISTENTE-CODE' },
    ]
    const suggestions = buildGroupSuggestions(products, null, 'CANILLA-34')
    expect(suggestions).toContain('EXISTENTE-CODE')
  })

  it('excludes the current product from suggestions', () => {
    const products = [
      { id: 'current', similarity_group_code: 'MY-GROUP' },
      { id: 'p2', similarity_group_code: 'OTHER-GROUP' },
    ]
    const suggestions = buildGroupSuggestions(products, 'current', 'CANILLA-34')
    expect(suggestions).not.toContain('MY-GROUP')
    expect(suggestions).toContain('OTHER-GROUP')
  })

  it('does not duplicate the generated code if it already appears in existing codes', () => {
    const products = [{ id: 'p1', similarity_group_code: 'CANILLA-34' }]
    const suggestions = buildGroupSuggestions(products, null, 'CANILLA-34')
    expect(suggestions.filter(c => c === 'CANILLA-34').length).toBe(1)
  })

  it('deduplicates repeated existing codes', () => {
    const products = [
      { id: 'p1', similarity_group_code: 'SAME-CODE' },
      { id: 'p2', similarity_group_code: 'SAME-CODE' },
    ]
    const suggestions = buildGroupSuggestions(products, null, 'GENERATED')
    expect(suggestions.filter(c => c === 'SAME-CODE').length).toBe(1)
  })

  it('limits existing codes to 2', () => {
    const products = [
      { id: 'p1', similarity_group_code: 'CODE-1' },
      { id: 'p2', similarity_group_code: 'CODE-2' },
      { id: 'p3', similarity_group_code: 'CODE-3' },
    ]
    const suggestions = buildGroupSuggestions(products, null, 'GENERATED')
    // generated + max 2 existing = 3 total
    expect(suggestions.length).toBeLessThanOrEqual(3)
  })

  it('ignores products without a similarity_group_code', () => {
    const products = [
      { id: 'p1', similarity_group_code: null },
      { id: 'p2', similarity_group_code: undefined },
      { id: 'p3', similarity_group_code: '' },
    ]
    const suggestions = buildGroupSuggestions(products, null, 'CANILLA-34')
    expect(suggestions).toEqual(['CANILLA-34'])
  })

  it('returns only the generated code when no products have group codes', () => {
    expect(buildGroupSuggestions([], null, 'TORNILLO-12')).toEqual(['TORNILLO-12'])
  })

  it('works correctly when currentId is null (create mode)', () => {
    const products = [{ id: 'p1', similarity_group_code: 'EXISTING' }]
    const suggestions = buildGroupSuggestions(products, null, 'GENERATED')
    expect(suggestions).toContain('EXISTING')
  })
})
