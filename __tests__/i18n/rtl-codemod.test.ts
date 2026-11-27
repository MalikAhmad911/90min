import { transformClassList, transformSource, transformToken } from '@/scripts/rtl-logical-classes.mjs'

describe('transformToken', () => {
  it.each([
    ['ml-2', 'ms-2'],
    ['mr-auto', 'me-auto'],
    ['-ml-1', '-ms-1'],
    ['pl-[3px]', 'ps-[3px]'],
    ['sm:pr-4', 'sm:pe-4'],
    ['hover:!left-0', 'hover:!start-0'],
    ['right-2', 'end-2'],
    ['text-left', 'text-start'],
    ['text-right', 'text-end'],
    ['rounded-l-lg', 'rounded-s-lg'],
    ['rounded-tr', 'rounded-se'],
    ['border-l', 'border-s'],
    ['border-r-2', 'border-e-2'],
    ['float-right', 'float-end'],
  ])('%s -> %s', (from, to) => {
    expect(transformToken(from)).toBe(to)
  })

  it.each(['rounded-lg', 'border-lime-500', 'prose', 'text-center', 'rtl:ml-2', 'mx-2', 'left'])(
    'leaves %s alone',
    (token) => {
      expect(transformToken(token)).toBeNull()
    }
  )
})

describe('transformClassList', () => {
  it('keeps left-1/2 when centred with translate-x', () => {
    const r = transformClassList('absolute left-1/2 -translate-x-1/2 ml-2')
    expect(r.value).toBe('absolute left-1/2 -translate-x-1/2 ms-2')
    expect(r.review[0].token).toBe('left-1/2')
  })

  it('ignores strings that are not class lists', () => {
    expect(transformClassList('Move left now').value).toBe('Move left now')
    expect(transformClassList('https://example.com/pl-2').value).toBe('https://example.com/pl-2')
  })
})

describe('transformSource', () => {
  it('rewrites className strings, ternaries and template chunks', () => {
    const src = [
      '<div className="ml-2 text-left">',
      "<a className={active ? 'pl-2' : 'pr-2'} />",
      '<b className={`border-l ${side === \'left\' ? \'mr-1\' : \'\'} p-2`} />',
    ].join('\n')
    expect(transformSource(src).code).toBe(
      [
        '<div className="ms-2 text-start">',
        "<a className={active ? 'ps-2' : 'pe-2'} />",
        '<b className={`border-s ${side === \'left\' ? \'me-1\' : \'\'} p-2`} />',
      ].join('\n')
    )
  })

  it('never touches non-className strings, text or dynamic fragments', () => {
    const src = [
      'const side = "ml-2"',
      '<p title="pl-2" aria-label="Move left">pr-2 text-left</p>',
      '<i className={`ml-${size} p-1`} />',
    ].join('\n')
    const r = transformSource(src)
    expect(r.code).toBe(src)
    expect(r.review.some((x: { token: string }) => x.token === 'ml-')).toBe(true)
  })

  it('handles cn()/clsx() calls and preserves line count', () => {
    const src = "const c = cn('ml-4',\n  isOpen && 'rounded-r-md')"
    const out = transformSource(src).code
    expect(out).toBe("const c = cn('ms-4',\n  isOpen && 'rounded-e-md')")
    expect(out.split('\n')).toHaveLength(2)
  })
})
