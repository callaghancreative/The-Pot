import { useEffect, useState } from 'react'
import './App.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/bricolage-grotesque/700.css'
import { supabase } from './lib/supabase'

function makeRoundCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''

  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  return code
}

function getSkinsSettings(round) {
  return (
    round.games.find(
      game => game.game_type === 'skins'
    )?.settings || {}
  )
}

function getCurrentSkinsValue(round, results) {
  const settings = getSkinsSettings(round)

  if (!settings.carryovers) {
    return 1
  }

  let value = 1

  for (let i = results.length - 1; i >= 0; i--) {
    if (Number(results[i].skins_won) === 0) {
      value += 1
    } else {
      break
    }
  }

  return value
}

function calculateSkinsTotals(round, results) {
  const totals = {}

  round.players.forEach(player => {
    totals[player.id] = 0
  })

  results.forEach(result => {
    if (
      result.winner_player_id &&
      Number(result.skins_won) > 0
    ) {
      totals[result.winner_player_id] +=
        Number(result.skins_won)
    }
  })

  return totals
}

function makeEmptyPokerSelection() {
  return {
    onePutt: false,
    nettBirdie: false,
    chipIn: false,
    nettEagle: false,
    nettAlbatross: false,
    threePutt: false,
    fourPutt: false,
    wipe: false
  }
}

function makePokerSelections(players) {
  const selections = {}

  players.forEach(player => {
    selections[player.id] = makeEmptyPokerSelection()
  })

  return selections
}

function calculatePokerSelection(selection = {}) {
  let cards = 0
  let fines = 0
  const achievements = []

  if (selection.onePutt) {
    cards += 1
    achievements.push('one_putt')
  }

  if (selection.nettBirdie) {
    cards += 1
    achievements.push('nett_birdie')
  }

  if (selection.chipIn) {
    cards += 2
    achievements.push('chip_in')
  }

  if (selection.nettEagle) {
    cards += 2
    achievements.push('nett_eagle')
  }

  if (selection.nettAlbatross) {
    cards += 3
    achievements.push('nett_albatross')
  }

  if (selection.threePutt) {
    fines += 1
    achievements.push('three_putt')
  }

  if (selection.fourPutt) {
    fines += 2
    achievements.push('four_putt')
  }

  if (selection.wipe) {
    fines += 1
    achievements.push('wipe')
  }

  return { cards, fines, achievements }
}

function pokerSelectionFromEvents(events = []) {
  const selection = makeEmptyPokerSelection()

  const eventMap = {
    one_putt: 'onePutt',
    nett_birdie: 'nettBirdie',
    chip_in: 'chipIn',
    nett_eagle: 'nettEagle',
    nett_albatross: 'nettAlbatross',
    three_putt: 'threePutt',
    four_putt: 'fourPutt',
    wipe: 'wipe'
  }

  events.forEach(eventName => {
    const field = eventMap[eventName]
    if (field) selection[field] = true
  })

  return selection
}

function getPokerEventsFromResult(result) {
  if (
    result?.achievements &&
    !Array.isArray(result.achievements) &&
    Array.isArray(result.achievements.events)
  ) {
    return result.achievements.events
  }

  if (Array.isArray(result?.achievements)) {
    return result.achievements
  }

  return []
}

function calculatePokerTotals(round, results) {
  const totals = {}

  round.players.forEach(player => {
    totals[player.id] = {
      cards: 0,
      fines: 0
    }
  })

  results.forEach(result => {
    if (!totals[result.player_id]) return

    totals[result.player_id].cards += Number(result.cards_earned || 0)
    totals[result.player_id].fines += Number(result.fines || 0)
  })

  return totals
}


function getPokerSettings(round) {
  return (
    round.games.find(
      game => game.game_type === 'poker'
    )?.settings || {}
  )
}

function hashString(value) {
  let hash = 2166136261

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function makeSeededRandom(seedValue) {
  let seed = hashString(seedValue) || 1

  return function seededRandom() {
    seed += 0x6D2B79F5

    let value = seed

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1
    )

    value ^= value + Math.imul(
      value ^ (value >>> 7),
      value | 61
    )

    return (
      (value ^ (value >>> 14)) >>> 0
    ) / 4294967296
  }
}

function createPokerDeck(seedValue) {
  const suits = ['S', 'H', 'D', 'C']
  const ranks = [
    '2', '3', '4', '5', '6', '7',
    '8', '9', 'T', 'J', 'Q', 'K', 'A'
  ]

  const deck = []

  suits.forEach(suit => {
    ranks.forEach(rank => {
      deck.push(`${rank}${suit}`)
    })
  })

  const random = makeSeededRandom(seedValue)

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  return deck
}

function getPokerCardsFromResult(result) {
  if (
    result?.achievements &&
    !Array.isArray(result.achievements) &&
    Array.isArray(result.achievements.cards)
  ) {
    return result.achievements.cards
  }

  return []
}

function calculatePokerHands(round, results) {
  const hands = {}

  round.players.forEach(player => {
    hands[player.id] = []
  })

  results.forEach(result => {
    if (!hands[result.player_id]) return

    hands[result.player_id].push(
      ...getPokerCardsFromResult(result)
    )
  })

  return hands
}

function cardRankValue(card) {
  const rank = card.slice(0, -1)

  const values = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14
  }

  return values[rank]
}

function compareNumberArrays(a, b) {
  const length = Math.max(a.length, b.length)

  for (let i = 0; i < length; i++) {
    const left = a[i] || 0
    const right = b[i] || 0

    if (left > right) return 1
    if (left < right) return -1
  }

  return 0
}

function evaluateFiveCardHand(cards) {
  const ranks = cards
    .map(cardRankValue)
    .sort((a, b) => b - a)

  const suits = cards.map(card =>
    card.slice(-1)
  )

  const rankCounts = {}

  ranks.forEach(rank => {
    rankCounts[rank] =
      (rankCounts[rank] || 0) + 1
  })

  const groups = Object.entries(rankCounts)
    .map(([rank, count]) => ({
      rank: Number(rank),
      count
    }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count
      }

      return b.rank - a.rank
    })

  const uniqueRanks = [
    ...new Set(ranks)
  ].sort((a, b) => b - a)

  let straightHigh = null

  if (
    uniqueRanks.length === 5 &&
    uniqueRanks[0] - uniqueRanks[4] === 4
  ) {
    straightHigh = uniqueRanks[0]
  }

  if (
    uniqueRanks.join(',') === '14,5,4,3,2'
  ) {
    straightHigh = 5
  }

  const flush = suits.every(
    suit => suit === suits[0]
  )

  if (flush && straightHigh) {
    return {
      category: 8,
      name:
        straightHigh === 14
          ? 'Royal Flush'
          : 'Straight Flush',
      tiebreak: [straightHigh]
    }
  }

  if (groups[0].count === 4) {
    return {
      category: 7,
      name: 'Four of a Kind',
      tiebreak: [
        groups[0].rank,
        groups[1].rank
      ]
    }
  }

  if (
    groups[0].count === 3 &&
    groups[1].count === 2
  ) {
    return {
      category: 6,
      name: 'Full House',
      tiebreak: [
        groups[0].rank,
        groups[1].rank
      ]
    }
  }

  if (flush) {
    return {
      category: 5,
      name: 'Flush',
      tiebreak: ranks
    }
  }

  if (straightHigh) {
    return {
      category: 4,
      name: 'Straight',
      tiebreak: [straightHigh]
    }
  }

  if (groups[0].count === 3) {
    const kickers = groups
      .slice(1)
      .map(group => group.rank)
      .sort((a, b) => b - a)

    return {
      category: 3,
      name: 'Three of a Kind',
      tiebreak: [
        groups[0].rank,
        ...kickers
      ]
    }
  }

  if (
    groups[0].count === 2 &&
    groups[1].count === 2
  ) {
    const pairRanks = [
      groups[0].rank,
      groups[1].rank
    ].sort((a, b) => b - a)

    return {
      category: 2,
      name: 'Two Pair',
      tiebreak: [
        ...pairRanks,
        groups[2].rank
      ]
    }
  }

  if (groups[0].count === 2) {
    const kickers = groups
      .slice(1)
      .map(group => group.rank)
      .sort((a, b) => b - a)

    return {
      category: 1,
      name: 'One Pair',
      tiebreak: [
        groups[0].rank,
        ...kickers
      ]
    }
  }

  return {
    category: 0,
    name: 'High Card',
    tiebreak: ranks
  }
}

function getFiveCardCombinations(cards) {
  const combinations = []

  for (let a = 0; a < cards.length - 4; a++) {
    for (let b = a + 1; b < cards.length - 3; b++) {
      for (let c = b + 1; c < cards.length - 2; c++) {
        for (let d = c + 1; d < cards.length - 1; d++) {
          for (let e = d + 1; e < cards.length; e++) {
            combinations.push([
              cards[a],
              cards[b],
              cards[c],
              cards[d],
              cards[e]
            ])
          }
        }
      }
    }
  }

  return combinations
}

function comparePokerHands(a, b) {
  if (a.category > b.category) return 1
  if (a.category < b.category) return -1

  return compareNumberArrays(
    a.tiebreak,
    b.tiebreak
  )
}

function getBestPokerHand(cards) {
  if (cards.length < 5) {
    return null
  }

  const combinations =
    getFiveCardCombinations(cards)

  let best = null

  combinations.forEach(fiveCards => {
    const evaluated =
      evaluateFiveCardHand(fiveCards)

    const hand = {
      ...evaluated,
      cards: fiveCards
    }

    if (
      !best ||
      comparePokerHands(hand, best) > 0
    ) {
      best = hand
    }
  })

  return best
}

function getPokerOutcome(round, results) {
  const playerCards =
    calculatePokerHands(round, results)

  const evaluatedPlayers =
    round.players.map(player => ({
      player,
      cards: playerCards[player.id] || [],
      hand: getBestPokerHand(
        playerCards[player.id] || []
      )
    }))

  const eligible = evaluatedPlayers.filter(
    item => item.hand
  )

  if (!eligible.length) {
    return {
      status: 'no-winner',
      players: evaluatedPlayers
    }
  }

  let best = eligible[0]

  eligible.slice(1).forEach(item => {
    if (
      comparePokerHands(
        item.hand,
        best.hand
      ) > 0
    ) {
      best = item
    }
  })

  const winners = eligible.filter(
    item =>
      comparePokerHands(
        item.hand,
        best.hand
      ) === 0
  )

  if (winners.length > 1) {
    return {
      status: 'tie',
      winners,
      players: evaluatedPlayers
    }
  }

  return {
    status: 'winner',
    winner: best,
    players: evaluatedPlayers
  }
}

function calculatePokerSettlement(round, results) {
  const settings = getPokerSettings(round)
  const totals = calculatePokerTotals(
    round,
    results
  )
  const outcome = getPokerOutcome(
    round,
    results
  )

  if (outcome.status !== 'winner') {
    return {
      outcome,
      payments: [],
      winnerReceives: 0
    }
  }

  const buyIn = Number(
    settings.buyIn || 0
  )

  const fineValue = Number(
    settings.fineValue || 0
  )

  const winnerId =
    outcome.winner.player.id

  const payments = round.players
    .filter(player => player.id !== winnerId)
    .map(player => {
      const fines =
        totals[player.id]?.fines || 0

      const fineAmount =
        fines * fineValue

      return {
        player,
        buyIn,
        fines,
        fineAmount,
        total: buyIn + fineAmount
      }
    })

  return {
    outcome,
    payments,
    winnerReceives:
      payments.reduce(
        (sum, payment) =>
          sum + payment.total,
        0
      )
  }
}

function formatPokerCard(card) {
  const rank = card.slice(0, -1)
  const suit = card.slice(-1)

  const suits = {
    S: '♠',
    H: '♥',
    D: '♦',
    C: '♣'
  }

  return `${rank}${suits[suit] || suit}`
}

const HOST_SESSION_KEY = 'thePotHostSession'

function App() {
  const [screen, setScreen] = useState('home')

  const [playerCount, setPlayerCount] = useState(4)
  const [players, setPlayers] = useState(['', '', '', ''])
  const [startingHole, setStartingHole] = useState(1)

  const [wolfEnabled, setWolfEnabled] = useState(true)
  const [skinsEnabled, setSkinsEnabled] = useState(false)
  const [pokerEnabled, setPokerEnabled] = useState(false)

  const [wolfDollarPoint, setWolfDollarPoint] = useState(1)
  const [birdieMultiplier, setBirdieMultiplier] = useState(2)
  const [eagleMultiplier, setEagleMultiplier] = useState(3)

  const [skinsMode, setSkinsMode] = useState('individual')
  const [skinsDollar, setSkinsDollar] = useState(5)
  const [skinsCarryovers, setSkinsCarryovers] = useState(true)

  const [pokerFineValue, setPokerFineValue] = useState(2)
  const [pokerBuyIn, setPokerBuyIn] = useState(10)

  const [joinCode, setJoinCode] = useState('')
  const [joinedRound, setJoinedRound] = useState(null)

  const [loading, setLoading] = useState(false)
  const [recoveringHost, setRecoveringHost] = useState(true)
  const [createdRound, setCreatedRound] = useState(null)
  const [error, setError] = useState('')

  const [activeRound, setActiveRound] = useState(null)
  const [wolfResults, setWolfResults] = useState([])

  const [wolfPlayerId, setWolfPlayerId] = useState('')
  const [partnerPlayerId, setPartnerPlayerId] = useState('')
  const [wolfResult, setWolfResult] = useState('win')
  const [scoreType, setScoreType] = useState('normal')
  
  const [viewerWolfResults, setViewerWolfResults] = useState([])
  const [viewerSkinsResults, setViewerSkinsResults] = useState([])

  const [skinsResults, setSkinsResults] = useState([])
  const [skinsWinnerId, setSkinsWinnerId] = useState('')
  const [pokerResults, setPokerResults] = useState([])
  const [pokerSelections, setPokerSelections] = useState({})
  const [viewerPokerResults, setViewerPokerResults] = useState([])

  useEffect(() => {
    let cancelled = false

    async function recoverHostRound() {
      const rawSession = localStorage.getItem(HOST_SESSION_KEY)

      if (!rawSession) {
        if (!cancelled) setRecoveringHost(false)
        return
      }

      try {
        const session = JSON.parse(rawSession)

        if (!session?.roundId || !session?.hostToken) {
          localStorage.removeItem(HOST_SESSION_KEY)
          if (!cancelled) setRecoveringHost(false)
          return
        }

        const { data: round, error: roundError } = await supabase
          .from('rounds')
          .select('*')
          .eq('id', session.roundId)
          .eq('host_token', session.hostToken)
          .maybeSingle()

        if (roundError) throw roundError

        if (!round) {
          localStorage.removeItem(HOST_SESSION_KEY)
          if (!cancelled) setRecoveringHost(false)
          return
        }

        const [
          playersResponse,
          gamesResponse,
          wolfResponse,
          skinsResponse,
          pokerResponse
        ] = await Promise.all([
          supabase
            .from('players')
            .select('*')
            .eq('round_id', round.id)
            .order('player_order'),
          supabase
            .from('round_games')
            .select('*')
            .eq('round_id', round.id),
          supabase
            .from('wolf_results')
            .select('*')
            .eq('round_id', round.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('skins_results')
            .select('*')
            .eq('round_id', round.id)
            .order('created_at', { ascending: true }),
          supabase
            .from('poker_results')
            .select('*')
            .eq('round_id', round.id)
            .order('created_at', { ascending: true })
        ])

        const firstError = [
          playersResponse.error,
          gamesResponse.error,
          wolfResponse.error,
          skinsResponse.error,
          pokerResponse.error
        ].find(Boolean)

        if (firstError) throw firstError
        if (cancelled) return

        const recoveredRound = {
          ...round,
          players: playersResponse.data || [],
          games: gamesResponse.data || []
        }

        const sequence = buildHoleSequence(round.starting_hole)

        let holeIndex = sequence.findIndex(
          hole => Number(hole) === Number(round.current_hole)
        )

        if (holeIndex < 0) holeIndex = 0
        if (round.status === 'completed') holeIndex = 18

        setActiveRound({
          ...recoveredRound,
          holeSequence: sequence,
          holeIndex
        })

        setCreatedRound(recoveredRound)
        setWolfResults(wolfResponse.data || [])
        setSkinsResults(skinsResponse.data || [])
        setPokerResults(pokerResponse.data || [])

        if (round.status !== 'completed') {
          const scheduledWolf = getScheduledWolf(
            recoveredRound.players,
            holeIndex
          )

          setWolfPlayerId(scheduledWolf?.id || '')
          setPartnerPlayerId('')
          setWolfResult('win')
          setScoreType('normal')
          setSkinsWinnerId('')
          setPokerSelections(
            makePokerSelections(recoveredRound.players)
          )
        }

        setScreen('round')
      } catch (err) {
        console.error('Host recovery failed:', err)
        localStorage.removeItem(HOST_SESSION_KEY)
      } finally {
        if (!cancelled) setRecoveringHost(false)
      }
    }

    recoverHostRound()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
  if (screen !== 'live-viewer' || !joinedRound?.id) {
    return
  }

  const roundId = joinedRound.id

  const channel = supabase
    .channel(`live-round-${roundId}`)

    // Watch the round itself:
    // current hole, completed status, etc.
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rounds',
        filter: `id=eq.${roundId}`
      },
      payload => {
        setJoinedRound(current => {
          if (!current) return current

          return {
            ...current,
            ...payload.new
          }
        })
      }
    )

    // Watch new Wolf results.
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'wolf_results',
        filter: `round_id=eq.${roundId}`
      },
      payload => {
        setViewerWolfResults(current => {
          const alreadyExists = current.some(
            result => result.id === payload.new.id
          )

          if (alreadyExists) {
            return current
          }

          return [...current, payload.new]
        })
      }
    )

    // Watch Wolf results being removed by Undo Last Hole.
    // DELETE events are intentionally unfiltered; the old row always includes
    // its primary key, so we only remove it if this viewer already has it.
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'wolf_results'
      },
      payload => {
        setViewerWolfResults(current =>
          current.filter(result => result.id !== payload.old.id)
        )
      }
    )

    // Watch new Skins results.
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'skins_results',
        filter: `round_id=eq.${roundId}`
      },
      payload => {
        setViewerSkinsResults(current => {
          const alreadyExists = current.some(
            result => result.id === payload.new.id
          )

          if (alreadyExists) return current

          return [...current, payload.new]
        })
      }
    )

    // Watch Skins results being removed by Undo Last Hole.
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'skins_results'
      },
      payload => {
        setViewerSkinsResults(current =>
          current.filter(result => result.id !== payload.old.id)
        )
      }
    )

    // Watch new 3-Putt Poker results.
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'poker_results',
        filter: `round_id=eq.${roundId}`
      },
      payload => {
        setViewerPokerResults(current => {
          const alreadyExists = current.some(
            result => result.id === payload.new.id
          )

          if (alreadyExists) return current

          return [...current, payload.new]
        })
      }
    )

    // Watch Poker results being removed by Undo Last Hole.
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'poker_results'
      },
      payload => {
        setViewerPokerResults(current =>
          current.filter(result => result.id !== payload.old.id)
        )
      }
    )

    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [screen, joinedRound?.id])

  function updatePlayer(index, value) {
    const next = [...players]
    next[index] = value
    setPlayers(next)
  }

  function updatePokerSelection(playerId, field) {
    setPokerSelections(current => {
      const existing = current[playerId] || makeEmptyPokerSelection()
      const nextValue = !existing[field]

      const updated = {
        ...existing,
        [field]: nextValue
      }

      if (field === 'threePutt' && nextValue) {
        updated.fourPutt = false
      }

      if (field === 'fourPutt' && nextValue) {
        updated.threePutt = false
      }

      return {
        ...current,
        [playerId]: updated
      }
    })
  }

  function leaveRound() {
    const shouldLeave = window.confirm(
      'Leave this round on this device? The round will remain saved, but this device will stop automatically restoring it.'
    )

    if (!shouldLeave) return

    localStorage.removeItem(HOST_SESSION_KEY)

    setActiveRound(null)
    setCreatedRound(null)
    setJoinedRound(null)

    setWolfResults([])
    setSkinsResults([])
    setPokerResults([])

    setViewerWolfResults([])
    setViewerSkinsResults([])
    setViewerPokerResults([])

    setWolfPlayerId('')
    setPartnerPlayerId('')
    setWolfResult('win')
    setScoreType('normal')
    setSkinsWinnerId('')
    setPokerSelections({})

    setJoinCode('')
    setError('')
    setScreen('home')

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveHole() {
  if (!activeRound) return

  setError('')
  setLoading(true)

  try {
    const currentHole =
      activeRound.holeSequence[activeRound.holeIndex]

    const hasWolf = activeRound.games.some(
      game => game.game_type === 'wolf'
    )

    const hasSkins = activeRound.games.some(
      game => game.game_type === 'skins'
    )

    const hasPoker = activeRound.games.some(
      game => game.game_type === 'poker'
    )

    /*
      -------------------------
      WOLF
      -------------------------
    */

    let newWolfResult = null

    if (hasWolf) {
      const wolfSettings =
        activeRound.games.find(
          game => game.game_type === 'wolf'
        )?.settings || {}

      let multiplier = 1

      if (scoreType === 'birdie') {
        multiplier = Number(
          wolfSettings.birdieMultiplier || 2
        )
      }

      if (scoreType === 'eagle') {
        multiplier = Number(
          wolfSettings.eagleMultiplier || 3
        )
      }

      let stake = 1

      for (
        let i = wolfResults.length - 1;
        i >= 0;
        i--
      ) {
        if (wolfResults[i].result === 'tie') {
          stake += 1
        } else {
          break
        }
      }

      const wolfRow = {
        round_id: activeRound.id,
        hole: currentHole,
        wolf_player_id: wolfPlayerId,
        partner_player_id:
          partnerPlayerId || null,
        result: wolfResult,
        stake,
        score_type: scoreType,
        multiplier:
          wolfResult === 'tie'
            ? 1
            : multiplier
      }

      const {
        data,
        error: wolfError
      } = await supabase
        .from('wolf_results')
        .insert(wolfRow)
        .select()
        .single()

      if (wolfError) throw wolfError

      newWolfResult = data
    }

    /*
      -------------------------
      SKINS
      -------------------------
    */

    let newSkinsResult = null

    if (hasSkins) {
      const skinsSettings =
        getSkinsSettings(activeRound)

      const currentSkinValue =
        getCurrentSkinsValue(
          activeRound,
          skinsResults
        )

      const isTie = skinsWinnerId === ''

      const skinsWon = isTie
        ? 0
        : skinsSettings.carryovers
          ? currentSkinValue
          : 1

      const skinsRow = {
        round_id: activeRound.id,
        hole: currentHole,
        winner_player_id:
          skinsWinnerId || null,
        skins_won: skinsWon
      }

      const {
        data,
        error: skinsError
      } = await supabase
        .from('skins_results')
        .insert(skinsRow)
        .select()
        .single()

      if (skinsError) throw skinsError

      newSkinsResult = data
    }

    /*
      -------------------------
      3-PUTT POKER
      -------------------------
    */

    let newPokerResults = []

    if (hasPoker) {
      const deck = createPokerDeck(
        `${activeRound.id}-${activeRound.round_code}`
      )

      const cardsAlreadyDealt =
        pokerResults.reduce(
          (total, result) =>
            total + Number(result.cards_earned || 0),
          0
        )

      let deckPosition = cardsAlreadyDealt

      const pokerRows = activeRound.players.map(player => {
        const selection =
          pokerSelections[player.id] || makeEmptyPokerSelection()

        const {
          cards,
          fines,
          achievements
        } = calculatePokerSelection(selection)

        if (deckPosition + cards > deck.length) {
          throw new Error(
            'The 52-card Poker deck has been exhausted.'
          )
        }

        const dealtCards = deck.slice(
          deckPosition,
          deckPosition + cards
        )

        deckPosition += cards

        return {
          round_id: activeRound.id,
          player_id: player.id,
          hole: currentHole,
          cards_earned: cards,
          fines,
          achievements: {
            events: achievements,
            cards: dealtCards
          }
        }
      })

      const {
        data,
        error: pokerError
      } = await supabase
        .from('poker_results')
        .insert(pokerRows)
        .select()

      if (pokerError) throw pokerError

      newPokerResults = data || []
    }

    /*
      Update local results
    */

    if (newWolfResult) {
      setWolfResults(current => [
        ...current,
        newWolfResult
      ])
    }

    if (newSkinsResult) {
      setSkinsResults(current => [
        ...current,
        newSkinsResult
      ])
    }

    if (newPokerResults.length) {
      setPokerResults(current => [
        ...current,
        ...newPokerResults
      ])
    }

    /*
      NEXT HOLE
    */

    const nextIndex =
      activeRound.holeIndex + 1

    if (nextIndex >= 18) {
      const { error: roundUpdateError } =
        await supabase
          .from('rounds')
          .update({
            status: 'completed',
            completed_at:
              new Date().toISOString()
          })
          .eq('id', activeRound.id)

      if (roundUpdateError) {
        throw roundUpdateError
      }

      setActiveRound({
        ...activeRound,
        status: 'completed',
        holeIndex: 18
      })

      return
    }

    const nextHole =
      activeRound.holeSequence[nextIndex]

    const { error: roundUpdateError } =
      await supabase
        .from('rounds')
        .update({
          current_hole: nextHole
        })
        .eq('id', activeRound.id)

    if (roundUpdateError) {
      throw roundUpdateError
    }

    const nextWolf = getScheduledWolf(
      activeRound.players,
      nextIndex
    )

    setActiveRound({
      ...activeRound,
      current_hole: nextHole,
      holeIndex: nextIndex
    })

    /*
      Reset inputs
    */

    setWolfPlayerId(nextWolf?.id || '')
    setPartnerPlayerId('')
    setWolfResult('win')
    setScoreType('normal')

    setSkinsWinnerId('')
    setPokerSelections(makePokerSelections(activeRound.players))

    requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
    })

  } catch (err) {
    console.error(err)

    setError(
      err.message || 'Could not save the hole.'
    )
  } finally {
    setLoading(false)
  }
}

  async function undoLastHole() {
    if (!activeRound || loading) return

    const playedHoleCount =
      activeRound.holeIndex >= 18
        ? 18
        : activeRound.holeIndex

    if (playedHoleCount <= 0) {
      setError('There is no completed hole to undo yet.')
      return
    }

    const undoIndex = playedHoleCount - 1
    const undoHole = activeRound.holeSequence[undoIndex]

    const shouldUndo = window.confirm(
      `Undo Hole ${undoHole}? Its Wolf, Skins and Poker results will be removed so you can score the hole again.`
    )

    if (!shouldUndo) return

    const hasWolf = activeRound.games.some(
      game => game.game_type === 'wolf'
    )

    const hasSkins = activeRound.games.some(
      game => game.game_type === 'skins'
    )

    const hasPoker = activeRound.games.some(
      game => game.game_type === 'poker'
    )

    const previousWolfResult = wolfResults
      .filter(result => Number(result.hole) === Number(undoHole))
      .at(-1)

    const previousSkinsResult = skinsResults
      .filter(result => Number(result.hole) === Number(undoHole))
      .at(-1)

    const previousPokerResults = pokerResults.filter(
      result => Number(result.hole) === Number(undoHole)
    )

    setError('')
    setLoading(true)

    try {
      if (hasWolf) {
        const { error: wolfDeleteError } = await supabase
          .from('wolf_results')
          .delete()
          .eq('round_id', activeRound.id)
          .eq('hole', undoHole)

        if (wolfDeleteError) throw wolfDeleteError
      }

      if (hasSkins) {
        const { error: skinsDeleteError } = await supabase
          .from('skins_results')
          .delete()
          .eq('round_id', activeRound.id)
          .eq('hole', undoHole)

        if (skinsDeleteError) throw skinsDeleteError
      }

      if (hasPoker) {
        const { error: pokerDeleteError } = await supabase
          .from('poker_results')
          .delete()
          .eq('round_id', activeRound.id)
          .eq('hole', undoHole)

        if (pokerDeleteError) throw pokerDeleteError
      }

      const { error: roundUpdateError } = await supabase
        .from('rounds')
        .update({
          current_hole: undoHole,
          status: 'active',
          completed_at: null
        })
        .eq('id', activeRound.id)

      if (roundUpdateError) throw roundUpdateError

      setWolfResults(current =>
        current.filter(
          result => Number(result.hole) !== Number(undoHole)
        )
      )

      setSkinsResults(current =>
        current.filter(
          result => Number(result.hole) !== Number(undoHole)
        )
      )

      setPokerResults(current =>
        current.filter(
          result => Number(result.hole) !== Number(undoHole)
        )
      )

      setActiveRound(current => ({
        ...current,
        current_hole: undoHole,
        status: 'active',
        completed_at: null,
        holeIndex: undoIndex
      }))

      const scheduledWolf = getScheduledWolf(
        activeRound.players,
        undoIndex
      )

      setWolfPlayerId(
        previousWolfResult?.wolf_player_id ||
        scheduledWolf?.id ||
        ''
      )
      setPartnerPlayerId(
        previousWolfResult?.partner_player_id || ''
      )
      setWolfResult(
        previousWolfResult?.result || 'win'
      )
      setScoreType(
        previousWolfResult?.score_type || 'normal'
      )

      setSkinsWinnerId(
        previousSkinsResult?.winner_player_id || ''
      )

      const restoredPokerSelections =
        makePokerSelections(activeRound.players)

      previousPokerResults.forEach(result => {
        restoredPokerSelections[result.player_id] =
          pokerSelectionFromEvents(
            getPokerEventsFromResult(result)
          )
      })

      setPokerSelections(restoredPokerSelections)
    } catch (err) {
      console.error(err)
      setError(
        err.message || 'Could not undo the last hole.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function generateUniqueRoundCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = makeRoundCode()

      const { data, error } = await supabase
        .from('rounds')
        .select('id')
        .eq('round_code', code)
        .maybeSingle()

      if (error) throw error
      if (!data) return code
    }

    throw new Error('Could not generate a unique round code.')
  }

  function buildHoleSequence(startingHole) {
  const holes = []

  for (let i = 0; i < 18; i++) {
    holes.push(((startingHole - 1 + i) % 18) + 1)
  }

  return holes
}

function getScheduledWolf(players, holeIndex) {
  if (!players?.length) return null

  // Wolf rotates through the player order.
  // User can override this on an individual hole.
  return players[holeIndex % players.length]
}

function calculateWolfPoints(round, results) {
  const totals = {}

  round.players.forEach(player => {
    totals[player.id] = 0
  })

  results.forEach(result => {
    if (result.result === 'tie') return

    const wolfId = result.wolf_player_id
    const partnerId = result.partner_player_id

    const opponents = round.players.filter(
      player =>
        player.id !== wolfId &&
        player.id !== partnerId
    )

    const value =
      Number(result.stake) *
      Number(result.multiplier)

    const wolfWon = result.result === 'win'
    const loneWolf = !partnerId
    const playerCount = round.players.length

    /*
      4 PLAYER WOLF
    */

    if (playerCount === 4) {
      if (loneWolf) {
        if (wolfWon) {
          totals[wolfId] += 3 * value

          opponents.forEach(player => {
            totals[player.id] -= value
          })
        } else {
          totals[wolfId] -= 3 * value

          opponents.forEach(player => {
            totals[player.id] += value
          })
        }

        return
      }

      if (wolfWon) {
        totals[wolfId] += value
        totals[partnerId] += value

        opponents.forEach(player => {
          totals[player.id] -= value
        })
      } else {
        totals[wolfId] -= value
        totals[partnerId] -= value

        opponents.forEach(player => {
          totals[player.id] += value
        })
      }

      return
    }

    /*
      3 PLAYER WOLF

      Normal 2 v 1:
      Pair = +/-1 each
      Solo = -/+2

      Lone Wolf:
      Wolf = +/-4
      Opponents = -/+2 each
    */

    if (playerCount === 3) {
      if (loneWolf) {
        if (wolfWon) {
          totals[wolfId] += 4 * value

          opponents.forEach(player => {
            totals[player.id] -= 2 * value
          })
        } else {
          totals[wolfId] -= 4 * value

          opponents.forEach(player => {
            totals[player.id] += 2 * value
          })
        }

        return
      }

      const soloPlayer = opponents[0]

      if (wolfWon) {
        totals[wolfId] += value
        totals[partnerId] += value
        totals[soloPlayer.id] -= 2 * value
      } else {
        totals[wolfId] -= value
        totals[partnerId] -= value
        totals[soloPlayer.id] += 2 * value
      }

      return
    }

    /*
      2-player Wolf rules haven't been defined yet,
      so deliberately do not invent scoring here.
    */
  })

  return totals
}


function calculateWolfDollarPositions(round, results) {
  const points = calculateWolfPoints(round, results)
  const settings =
    round.games.find(game => game.game_type === 'wolf')?.settings || {}
  const dollarsPerPoint = Number(settings.dollarsPerPoint || 0)
  const positions = {}

  round.players.forEach(player => {
    positions[player.id] =
      Number(points[player.id] || 0) * dollarsPerPoint
  })

  return positions
}

function calculateSkinsDollarPositions(round, results) {
  const settings = getSkinsSettings(round)
  const dollarsPerSkin = Number(settings.dollarsPerSkin || 0)
  const positions = {}

  round.players.forEach(player => {
    positions[player.id] = 0
  })

  results.forEach(result => {
    if (
      !result.winner_player_id ||
      Number(result.skins_won || 0) <= 0
    ) {
      return
    }

    const amountPerOpponent =
      Number(result.skins_won) * dollarsPerSkin

    round.players.forEach(player => {
      if (player.id === result.winner_player_id) {
        return
      }

      positions[player.id] -= amountPerOpponent
      positions[result.winner_player_id] += amountPerOpponent
    })
  })

  return positions
}

function calculatePokerDollarPositions(round, results) {
  const positions = {}

  round.players.forEach(player => {
    positions[player.id] = 0
  })

  const settlement =
    calculatePokerSettlement(round, results)

  if (settlement.outcome.status !== 'winner') {
    return positions
  }

  const winnerId =
    settlement.outcome.winner.player.id

  settlement.payments.forEach(payment => {
    positions[payment.player.id] -= payment.total
    positions[winnerId] += payment.total
  })

  return positions
}

function calculateCombinedPositions(
  round,
  wolfResults,
  skinsResults,
  pokerResults
) {
  const hasWolf = round.games.some(
    game => game.game_type === 'wolf'
  )

  const hasSkins = round.games.some(
    game => game.game_type === 'skins'
  )

  const hasPoker = round.games.some(
    game => game.game_type === 'poker'
  )

  const wolf = hasWolf
    ? calculateWolfDollarPositions(round, wolfResults)
    : {}

  const skins = hasSkins
    ? calculateSkinsDollarPositions(round, skinsResults)
    : {}

  const poker = hasPoker
    ? calculatePokerDollarPositions(round, pokerResults)
    : {}

  const combined = {}

  round.players.forEach(player => {
    const wolfAmount = Number(wolf[player.id] || 0)
    const skinsAmount = Number(skins[player.id] || 0)
    const pokerAmount = Number(poker[player.id] || 0)

    combined[player.id] = {
      wolf: wolfAmount,
      skins: skinsAmount,
      poker: pokerAmount,
      total: wolfAmount + skinsAmount + pokerAmount
    }
  })

  return combined
}

function buildSettlementPayments(round, combinedPositions) {
  const creditors = []
  const debtors = []

  round.players.forEach(player => {
    const amount =
      Math.round(
        Number(combinedPositions[player.id]?.total || 0) * 100
      ) / 100

    if (amount > 0.009) {
      creditors.push({
        player,
        amount
      })
    }

    if (amount < -0.009) {
      debtors.push({
        player,
        amount: Math.abs(amount)
      })
    }
  })

  const payments = []
  let creditorIndex = 0
  let debtorIndex = 0

  while (
    creditorIndex < creditors.length &&
    debtorIndex < debtors.length
  ) {
    const creditor = creditors[creditorIndex]
    const debtor = debtors[debtorIndex]

    const amount =
      Math.min(creditor.amount, debtor.amount)

    if (amount > 0.009) {
      payments.push({
        from: debtor.player,
        to: creditor.player,
        amount:
          Math.round(amount * 100) / 100
      })
    }

    creditor.amount =
      Math.round(
        (creditor.amount - amount) * 100
      ) / 100

    debtor.amount =
      Math.round(
        (debtor.amount - amount) * 100
      ) / 100

    if (creditor.amount <= 0.009) {
      creditorIndex += 1
    }

    if (debtor.amount <= 0.009) {
      debtorIndex += 1
    }
  }

  return payments
}

function formatMoney(value) {
  const amount = Number(value || 0)
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''

  return `${sign}$${Math.abs(amount).toFixed(2)}`
}

  async function startRound(roundToStart) {
  const round = roundToStart || createdRound

  if (!round) return

  const hasWolf = round.games.some(
    game => game.game_type === 'wolf'
  )

  if (hasWolf && round.players.length === 2) {
    setError(
      '2-player Wolf scoring has not been configured yet. Please use 3 or 4 players for Wolf.'
    )
    return
  }

  const sequence = buildHoleSequence(round.starting_hole)
  const scheduledWolf = getScheduledWolf(round.players, 0)

  if (round.id && round.host_token) {
    localStorage.setItem(
      HOST_SESSION_KEY,
      JSON.stringify({
        roundId: round.id,
        hostToken: round.host_token,
        roundCode: round.round_code
      })
    )
  }

  setActiveRound({
    ...round,
    holeSequence: sequence,
    holeIndex: 0
  })

  setWolfResults([])

  setWolfPlayerId(scheduledWolf?.id || '')
  setPartnerPlayerId('')
  setWolfResult('win')
  setScoreType('normal')

  setSkinsResults([])
  setSkinsWinnerId('')
  setPokerResults([])
  setPokerSelections(makePokerSelections(round.players))

  setScreen('round')
}

  async function createRound() {
    setError('')

    const activePlayers = players
      .slice(0, playerCount)
      .map(name => name.trim())

    if (activePlayers.some(name => !name)) {
      setError('Please enter a name for every player.')
      return
    }

    if (!wolfEnabled && !skinsEnabled && !pokerEnabled) {
      setError('Please select at least one game.')
      return
    }

    if (wolfEnabled && playerCount === 2) {
      setError(
        '2-player Wolf scoring has not been configured yet. Please use 3 or 4 players for Wolf.'
      )
      return
    }

    setLoading(true)

    try {
      const roundCode = await generateUniqueRoundCode()

      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .insert({
          round_code: roundCode,
          starting_hole: Number(startingHole),
          current_hole: Number(startingHole),
          status: 'active'
        })
        .select()
        .single()

      if (roundError) throw roundError

      const playerRows = activePlayers.map((name, index) => ({
        round_id: round.id,
        name,
        player_order: index + 1
      }))

      const { data: insertedPlayers, error: playersError } = await supabase
        .from('players')
        .insert(playerRows)
        .select()

      if (playersError) throw playersError

      const gameRows = []

      if (wolfEnabled) {
        gameRows.push({
          round_id: round.id,
          game_type: 'wolf',
          settings: {
            dollarsPerPoint: Number(wolfDollarPoint),
            birdieMultiplier: Number(birdieMultiplier),
            eagleMultiplier: Number(eagleMultiplier)
          }
        })
      }

      if (skinsEnabled) {
        gameRows.push({
          round_id: round.id,
          game_type: 'skins',
          settings: {
            mode: skinsMode,
            dollarsPerSkin: Number(skinsDollar),
            carryovers: skinsCarryovers
          }
        })
      }

      if (pokerEnabled) {
        gameRows.push({
          round_id: round.id,
          game_type: 'poker',
          settings: {
            fineValue: Number(pokerFineValue),
            buyIn: Number(pokerBuyIn)
          }
        })
      }

      const { error: gamesError } = await supabase
        .from('round_games')
        .insert(gameRows)

      if (gamesError) throw gamesError

      localStorage.setItem(
        HOST_SESSION_KEY,
        JSON.stringify({
          roundId: round.id,
          hostToken: round.host_token,
          roundCode: round.round_code
        })
      )

      setCreatedRound({
        ...round,
        players: insertedPlayers,
        games: gameRows
      })

      setScreen('created')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Something went wrong creating the round.')
    } finally {
      setLoading(false)
    }
  }

  async function joinRound() {
    setError('')

    const code = joinCode.trim().toUpperCase()

    if (code.length !== 4) {
      setError('Enter the 4-character round code.')
      return
    }

    setLoading(true)

    try {
      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .select('*')
        .eq('round_code', code)
        .maybeSingle()

      if (roundError) throw roundError

      if (!round) {
        setError('Round not found.')
        return
      }

      const { data: roundPlayers, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('round_id', round.id)
        .order('player_order')

      if (playersError) throw playersError

      const { data: games, error: gamesError } = await supabase
        .from('round_games')
        .select('*')
        .eq('round_id', round.id)

      if (gamesError) throw gamesError

      setJoinedRound({
        ...round,
        players: roundPlayers,
        games
      })

      setScreen('joined')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not join the round.')
    } finally {
      setLoading(false)
    }
  }

  async function openLiveViewer() {
  if (!joinedRound) return

  setError('')
  setLoading(true)

  try {
    const hasWolf = joinedRound.games.some(
      game => game.game_type === 'wolf'
    )

    const hasSkins = joinedRound.games.some(
      game => game.game_type === 'skins'
    )

    const hasPoker = joinedRound.games.some(
      game => game.game_type === 'poker'
    )

    let existingWolfResults = []
    let existingSkinsResults = []
    let existingPokerResults = []

    if (hasWolf) {
      const { data, error: resultsError } = await supabase
        .from('wolf_results')
        .select('*')
        .eq('round_id', joinedRound.id)
        .order('created_at', { ascending: true })

      if (resultsError) throw resultsError

      existingWolfResults = data || []
    }

    if (hasSkins) {
      const { data, error: skinsError } = await supabase
        .from('skins_results')
        .select('*')
        .eq('round_id', joinedRound.id)
        .order('created_at', { ascending: true })

      if (skinsError) throw skinsError

      existingSkinsResults = data || []
    }

    if (hasPoker) {
      const { data, error: pokerError } = await supabase
        .from('poker_results')
        .select('*')
        .eq('round_id', joinedRound.id)
        .order('created_at', { ascending: true })

      if (pokerError) throw pokerError

      existingPokerResults = data || []
    }

    // Re-fetch the round in case the host has
    // already moved holes since this viewer joined.
    const { data: freshRound, error: roundError } =
      await supabase
        .from('rounds')
        .select('*')
        .eq('id', joinedRound.id)
        .single()

    if (roundError) throw roundError

    setJoinedRound(current => ({
      ...current,
      ...freshRound
    }))

    setViewerWolfResults(existingWolfResults)
    setViewerSkinsResults(existingSkinsResults)
    setViewerPokerResults(existingPokerResults)
    setScreen('live-viewer')

  } catch (err) {
    console.error(err)

    setError(
      err.message || 'Could not open the live round.'
    )
  } finally {
    setLoading(false)
  }
}

  if (recoveringHost) {
    return (
      <main className="app-shell">
        <section className="create-shell">
          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo"
          />

          <div className="success-card">
            <p className="eyebrow">THE POT</p>
            <h2>Restoring your round...</h2>
            <p className="success-copy">
              Checking for an active host session on this device.
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'home') {
    return (
      <main className="app-shell">
        <section className="create-shell">
          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo"
          />

          <div className="create-header">
            <p className="eyebrow">GOLF SIDE GAMES</p>

            <h1>
              <span>Good golf.</span>
              <br />
              <span className="hero-punchline">Bad decisions.</span>
            </h1>

            <p className="intro">
              Wolf. Skins. 3-Putt Poker.<br />
              Keep the games running and the group honest.
            </p>

            <div className="actions">
              <button
                className="primary-button"
                onClick={() => {
                  setError('')
                  setScreen('create')
                }}
              >
                Create Round
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  setError('')
                  setScreen('join')
                }}
              >
                Join Round
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'join') {
    return (
      <main className="app-shell">
        <section className="create-shell">
          <button className="back-button" onClick={() => setScreen('home')}>
            ← Back
          </button>

          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo small-logo"
          />

          <div className="create-header">
            <p className="eyebrow">JOIN ROUND</p>
            <h1>Find the pot.</h1>
          </div>

          <div className="form-card">
            <label className="code-label">
              Round Code
              <input
                className="join-code-input"
                value={joinCode}
                onChange={e =>
                  setJoinCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 4)
                  )
                }
                placeholder="7K3P"
                maxLength={4}
                autoFocus
              />
            </label>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              className="primary-button create-button"
              onClick={joinRound}
              disabled={loading}
            >
              {loading ? 'Finding Round...' : 'Join Round'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'joined' && joinedRound) {
    return (
      <main className="app-shell">
        <section className="create-shell">
          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo small-logo"
          />

          <div className="success-card">
            <p className="eyebrow">ROUND FOUND</p>

            <h1 className="round-code">
              {joinedRound.round_code}
            </h1>

            <p className="success-copy">
              You’re in. This is currently the viewer version of the round.
            </p>

            <div className="player-list">
              {joinedRound.players.map(player => (
                <div key={player.id} className="player-pill">
                  {player.name}
                </div>
              ))}
            </div>

            <div className="joined-games">
              {joinedRound.games.map(game => (
                <div key={game.id} className="joined-game">
                  {game.game_type === 'wolf' && 'Wolf'}
                  {game.game_type === 'skins' && 'Skins'}
                  {game.game_type === 'poker' && '3-Putt Poker'}
                </div>
              ))}
            </div>

            <p className="success-copy">
              Starting Hole: {joinedRound.starting_hole}
            </p>
            
            <button
              className="primary-button"
              onClick={openLiveViewer}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'View Live Round'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'live-viewer' && joinedRound) {
  const hasWolf = joinedRound.games.some(
    game => game.game_type === 'wolf'
  )

  const hasSkins = joinedRound.games.some(
    game => game.game_type === 'skins'
  )

  const hasPoker = joinedRound.games.some(
    game => game.game_type === 'poker'
  )

  const totals = hasWolf
    ? calculateWolfPoints(joinedRound, viewerWolfResults)
    : {}

  const viewerSkinsTotals = hasSkins
    ? calculateSkinsTotals(joinedRound, viewerSkinsResults)
    : {}

  const viewerSkinsSettings = hasSkins
    ? getSkinsSettings(joinedRound)
    : {}

  const viewerPokerTotals = hasPoker
    ? calculatePokerTotals(joinedRound, viewerPokerResults)
    : {}

  const viewerPokerSettings = hasPoker
    ? getPokerSettings(joinedRound)
    : {}

  const viewerPokerHands = hasPoker
    ? calculatePokerHands(
        joinedRound,
        viewerPokerResults
      )
    : {}

  const viewerPokerOutcome = hasPoker
    ? getPokerOutcome(
        joinedRound,
        viewerPokerResults
      )
    : null

  const viewerPokerSettlement =
    hasPoker && joinedRound.status === 'completed'
      ? calculatePokerSettlement(
          joinedRound,
          viewerPokerResults
        )
      : null

  const isComplete =
    joinedRound.status === 'completed'

  const viewerCombinedPositions =
    calculateCombinedPositions(
      joinedRound,
      viewerWolfResults,
      viewerSkinsResults,
      viewerPokerResults
    )

  const viewerSettlementPayments =
    isComplete
      ? buildSettlementPayments(
          joinedRound,
          viewerCombinedPositions
        )
      : []

  return (
    <main className="app-shell">
      <section className="create-shell">

        <img
          src="/brand/the-pot-logo.png"
          alt="THE POT"
          className="brand-logo small-logo"
        />

        <div className="round-topbar">
          <div>
            <p className="eyebrow">
              LIVE · {joinedRound.round_code}
            </p>

            <h1 className="hole-title">
              {isComplete
                ? 'Finished'
                : `Hole ${joinedRound.current_hole}`}
            </h1>
          </div>

          <div className="live-badge">
            <span className="live-dot"></span>
            LIVE
          </div>
        </div>

        {hasWolf && (
          <>
            <div className="viewer-section-title">
              <span>Wolf Standings</span>
              <span>
                {viewerWolfResults.length} holes scored
              </span>
            </div>

            <div className="scoreboard-card">
              {joinedRound.players.map(player => (
                <div
                  key={player.id}
                  className="score-row"
                >
                  <span>{player.name}</span>

                  <strong>
                    {totals[player.id] > 0 ? '+' : ''}
                    {totals[player.id] || 0}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}

        {hasSkins && (
          <>
            <div className="viewer-section-title">
              <span>Skins Standings</span>
              <span>
                ${Number(viewerSkinsSettings.dollarsPerSkin || 0)} / skin
              </span>
            </div>

            <div className="scoreboard-card">
              {joinedRound.players.map(player => (
                <div
                  key={player.id}
                  className="score-row"
                >
                  <span>{player.name}</span>
                  <strong>{viewerSkinsTotals[player.id] || 0}</strong>
                </div>
              ))}
            </div>
          </>
        )}

        {hasPoker && (
          <>
            <div className="viewer-section-title">
              <span>3-Putt Poker</span>
              <span>
                ${Number(viewerPokerSettings.buyIn || 0)} buy-in · ${Number(viewerPokerSettings.fineValue || 0)} / fine
              </span>
            </div>

            <div className="scoreboard-card">
              {joinedRound.players.map(player => {
                const pokerTotal = viewerPokerTotals[player.id] || {
                  cards: 0,
                  fines: 0
                }

                const cards =
                  viewerPokerHands[player.id] || []

                const bestHand =
                  getBestPokerHand(cards)

                return (
                  <div
                    key={player.id}
                    className="score-row"
                  >
                    <span>
                      {player.name}
                      <small className="viewer-note">
                        {cards.length
                          ? ` · ${cards.map(formatPokerCard).join(' ')}`
                          : ' · No cards yet'}
                      </small>
                    </span>

                    <strong>
                      {bestHand
                        ? bestHand.name
                        : `${pokerTotal.cards} cards`}
                      {' · '}
                      {pokerTotal.fines} fines
                    </strong>
                  </div>
                )
              })}
            </div>

            {isComplete &&
              viewerPokerSettlement?.outcome?.status === 'winner' && (
                <div className="success-card">
                  <p className="eyebrow">
                    POKER WINNER
                  </p>

                  <h2>
                    {viewerPokerSettlement.outcome.winner.player.name}
                    {' · '}
                    {viewerPokerSettlement.outcome.winner.hand.name}
                  </h2>

                  <p className="success-copy">
                    Winning hand:{' '}
                    {viewerPokerSettlement.outcome.winner.hand.cards
                      .map(formatPokerCard)
                      .join(' ')}
                  </p>

                  <div className="player-list">
                    {viewerPokerSettlement.payments.map(payment => (
                      <div
                        key={payment.player.id}
                        className="player-pill"
                      >
                        {payment.player.name} owes $
                        {payment.total.toFixed(2)}
                      </div>
                    ))}
                  </div>

                  <p className="success-copy">
                    Total received: $
                    {viewerPokerSettlement.winnerReceives.toFixed(2)}
                  </p>
                </div>
              )}

            {isComplete &&
              viewerPokerOutcome?.status === 'tie' && (
                <div className="error-message">
                  Poker finished in an exact tie between{' '}
                  {viewerPokerOutcome.winners
                    .map(item => item.player.name)
                    .join(' and ')}.
                  Settle the Poker pot manually.
                </div>
              )}

            {isComplete &&
              viewerPokerOutcome?.status === 'no-winner' && (
                <div className="error-message">
                  No player has five Poker cards, so there is no automatic Poker winner.
                </div>
              )}
          </>
        )}

        <div className="viewer-section-title">
          <span>{isComplete ? 'Final Pot' : 'Live Pot'}</span>
          <span>
            {isComplete ? 'Final balance' : 'Current position'}
          </span>
        </div>

        <div className="scoreboard-card">
          {joinedRound.players.map(player => {
            const position =
              viewerCombinedPositions[player.id] || {
                wolf: 0,
                skins: 0,
                poker: 0,
                total: 0
              }

            return (
              <div
                key={player.id}
                className="score-row"
              >
                <span>
                  {player.name}
                  <small className="viewer-note">
                    {hasWolf
                      ? ` · Wolf ${formatMoney(position.wolf)}`
                      : ''}
                    {hasSkins
                      ? ` · Skins ${formatMoney(position.skins)}`
                      : ''}
                    {hasPoker
                      ? ` · Poker ${formatMoney(position.poker)}`
                      : ''}
                  </small>
                </span>

                <strong>
                  {formatMoney(position.total)}
                </strong>
              </div>
            )
          })}
        </div>

        {isComplete && (
          <>
            <div className="success-card">
              <p className="eyebrow">
                ROUND COMPLETE
              </p>

              <h2>The pot is settled.</h2>
            </div>

            {viewerSettlementPayments.length > 0 && (
              <>
                <div className="viewer-section-title">
                  <span>Settle Up</span>
                  <span>
                    {viewerSettlementPayments.length}{' '}
                    {viewerSettlementPayments.length === 1
                      ? 'payment'
                      : 'payments'}
                  </span>
                </div>

                <div className="scoreboard-card">
                  {viewerSettlementPayments.map(
                    (payment, index) => (
                      <div
                        key={`${payment.from.id}-${payment.to.id}-${index}`}
                        className="score-row"
                      >
                        <span>
                          {payment.from.name} pays{' '}
                          {payment.to.name}
                        </span>

                        <strong>
                          ${payment.amount.toFixed(2)}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
          </>
        )}

        <p className="viewer-note">
          View only · Scores update automatically
        </p>

      </section>
    </main>
  )
}

  if (screen === 'created' && createdRound) {
    return (
      <main className="app-shell">
        <section className="create-shell">
          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo small-logo"
          />

          <div className="success-card">
            <p className="eyebrow">ROUND CREATED</p>

            <h1 className="round-code">
              {createdRound.round_code}
            </h1>

            <p className="success-copy">
              Share this code with the group to join the round.
            </p>

            <div className="player-list">
              {createdRound.players.map(player => (
                <div key={player.id} className="player-pill">
                  {player.name}
                </div>
              ))}
            </div>

            <button
              className="primary-button"
              onClick={() => startRound(createdRound)}
            >
              Start Round
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'round' && activeRound) {
  const finished = activeRound.holeIndex >= 18

  const currentHole = finished
    ? null
    : activeRound.holeSequence[activeRound.holeIndex]

  const hasWolf = activeRound.games.some(
    game => game.game_type === 'wolf'
  )

  const hasSkins = activeRound.games.some(
    game => game.game_type === 'skins'
  )

  const hasPoker = activeRound.games.some(
    game => game.game_type === 'poker'
  )

  const totals = hasWolf
    ? calculateWolfPoints(activeRound, wolfResults)
    : {}

  const wolfSettings = hasWolf
    ? activeRound.games.find(game => game.game_type === 'wolf')
        ?.settings || {}
    : {}

  const currentSkinValue = hasSkins
    ? getCurrentSkinsValue(activeRound, skinsResults)
    : 0

  const skinsTotals = hasSkins
    ? calculateSkinsTotals(activeRound, skinsResults)
    : {}

  const pokerTotals = hasPoker
    ? calculatePokerTotals(activeRound, pokerResults)
    : {}

  const pokerHands = hasPoker
    ? calculatePokerHands(
        activeRound,
        pokerResults
      )
    : {}

  const pokerSettings = hasPoker
    ? getPokerSettings(activeRound)
    : {}

  const pokerOutcome = hasPoker
    ? getPokerOutcome(
        activeRound,
        pokerResults
      )
    : null

  const pokerSettlement =
    hasPoker && finished
      ? calculatePokerSettlement(
          activeRound,
          pokerResults
        )
      : null

  const combinedPositions =
    calculateCombinedPositions(
      activeRound,
      wolfResults,
      skinsResults,
      pokerResults
    )

  const settlementPayments =
    finished
      ? buildSettlementPayments(
          activeRound,
          combinedPositions
        )
      : []

  return (
    <main className="app-shell">
      <section className="create-shell">

        <img
          src="/brand/the-pot-logo.png"
          alt="THE POT"
          className="brand-logo small-logo"
        />

        <div className="round-topbar">
          <div>
            <p className="eyebrow">
              ROUND {activeRound.round_code}
            </p>

            {!finished && (
              <h1 className="hole-title">
                Hole {currentHole}
              </h1>
            )}
          </div>

          <div className="hole-progress">
            {Math.min(activeRound.holeIndex + 1, 18)} / 18
          </div>
        </div>

        <button
          type="button"
          className="secondary-button spaced-action-button"
          onClick={leaveRound}
          disabled={loading}
        >
          Leave Round
        </button>

        {!finished && (
          <div className="form-card">

  {/* WOLF */}
  {hasWolf && (
    <>
      <div className="form-section">
        <h2>Wolf</h2>

        <select
          value={wolfPlayerId}
          onChange={e => {
            setWolfPlayerId(e.target.value)
            setPartnerPlayerId('')
          }}
        >
          {activeRound.players.map(player => (
            <option
              key={player.id}
              value={player.id}
            >
              {player.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-section">
        <h2>Partner</h2>

        <div className="partner-grid">
          <button
            type="button"
            className={
              partnerPlayerId === ''
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setPartnerPlayerId('')}
          >
            Lone Wolf
          </button>

          {activeRound.players
            .filter(player => player.id !== wolfPlayerId)
            .map(player => (
              <button
                key={player.id}
                type="button"
                className={
                  partnerPlayerId === player.id
                    ? 'choice-button active'
                    : 'choice-button'
                }
                onClick={() =>
                  setPartnerPlayerId(player.id)
                }
              >
                {player.name}
              </button>
            ))}
        </div>
      </div>

      <div className="form-section">
        <h2>Winning Score</h2>

        <div className="choice-grid">
          <button
            type="button"
            className={
              scoreType === 'normal'
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setScoreType('normal')}
          >
            Normal
          </button>

          <button
            type="button"
            className={
              scoreType === 'birdie'
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setScoreType('birdie')}
          >
            Birdie ×{wolfSettings.birdieMultiplier || 2}
          </button>

          <button
            type="button"
            className={
              scoreType === 'eagle'
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setScoreType('eagle')}
          >
            Eagle ×{wolfSettings.eagleMultiplier || 3}
          </button>
        </div>
      </div>

      <div className="form-section">
        <h2>Result</h2>

        <div className="result-grid">
          <button
            type="button"
            className={
              wolfResult === 'win'
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setWolfResult('win')}
          >
            Wolf Win
          </button>

          <button
            type="button"
            className={
              wolfResult === 'tie'
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setWolfResult('tie')}
          >
            Tie
          </button>

          <button
            type="button"
            className={
              wolfResult === 'loss'
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() => setWolfResult('loss')}
          >
            Wolf Loss
          </button>
        </div>
      </div>
    </>
  )}

  {/* SKINS */}
  {hasSkins && (
    <div className="game-scoring-block">
      <div className="game-scoring-heading">
        <div>
          <p className="eyebrow">
            SKINS
          </p>

          <h2>
            Who won the hole?
          </h2>
        </div>

        <div className="skin-value">
          {currentSkinValue}

          <span>
            {currentSkinValue === 1
              ? 'skin'
              : 'skins'}
          </span>
        </div>
      </div>

      <div className="skins-choice-grid">
        <button
          type="button"
          className={
            skinsWinnerId === ''
              ? 'choice-button active'
              : 'choice-button'
          }
          onClick={() => setSkinsWinnerId('')}
        >
          Tie
        </button>

        {activeRound.players.map(player => (
          <button
            key={player.id}
            type="button"
            className={
              skinsWinnerId === player.id
                ? 'choice-button active'
                : 'choice-button'
            }
            onClick={() =>
              setSkinsWinnerId(player.id)
            }
          >
            {player.name}
          </button>
        ))}
      </div>

      <div className="skins-mini-scoreboard">
        {activeRound.players.map(player => (
          <div
            key={player.id}
            className="skins-mini-row"
          >
            <span>
              {player.name}
            </span>

            <strong>
              {skinsTotals[player.id] || 0}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )}

  {/* 3-PUTT POKER */}
  {hasPoker && (
    <div className="game-scoring-block">
      <div className="game-scoring-heading">
        <div>
          <p className="eyebrow">3-PUTT POKER</p>
          <h2>Cards & fines</h2>
        </div>
      </div>

      {activeRound.players.map(player => {
        const selection =
          pokerSelections[player.id] || makeEmptyPokerSelection()

        const pokerHoleTotal = calculatePokerSelection(selection)

        return (
          <div key={player.id} className="form-section">
            <h2>{player.name}</h2>

            <div className="choice-grid">
              <button
                type="button"
                className={selection.onePutt ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'onePutt')}
              >
                1-Putt
              </button>

              <button
                type="button"
                className={selection.nettBirdie ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'nettBirdie')}
              >
                Nett Birdie
              </button>

              <button
                type="button"
                className={selection.chipIn ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'chipIn')}
              >
                Chip-In
              </button>

              <button
                type="button"
                className={selection.nettEagle ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'nettEagle')}
              >
                Nett Eagle
              </button>

              <button
                type="button"
                className={selection.nettAlbatross ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'nettAlbatross')}
              >
                Nett Albatross
              </button>

              <button
                type="button"
                className={selection.threePutt ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'threePutt')}
              >
                3-Putt
              </button>

              <button
                type="button"
                className={selection.fourPutt ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'fourPutt')}
              >
                4-Putt
              </button>

              <button
                type="button"
                className={selection.wipe ? 'choice-button active' : 'choice-button'}
                onClick={() => updatePokerSelection(player.id, 'wipe')}
              >
                Wipe
              </button>
            </div>

            <p className="viewer-note">
              This hole: {pokerHoleTotal.cards} cards · {pokerHoleTotal.fines} fines
            </p>
          </div>
        )
      })}
    </div>
  )}

  {/* ERRORS */}
  {error && (
    <div className="error-message">
      {error}
    </div>
  )}

  {/* SAVE WHOLE HOLE */}
  <button
    className="primary-button create-button"
    onClick={saveHole}
    disabled={loading}
  >
    {loading
      ? 'Locking In...'
      : `Lock In Hole ${currentHole}`}
  </button>

            </div>
        )}

        {hasWolf && (
          <>
            <div className="viewer-section-title">
              <span>Wolf Standings</span>
              <span>Points</span>
            </div>

            <div className="scoreboard-card">
              {activeRound.players.map(player => (
                <div
                  key={player.id}
                  className="score-row"
                >
                  <span>{player.name}</span>
                  <strong>
                    {totals[player.id] > 0 ? '+' : ''}
                    {totals[player.id] || 0}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}

        {hasSkins && (
          <>
            <div className="viewer-section-title">
              <span>Skins Standings</span>
              <span>Skins Won</span>
            </div>

            <div className="scoreboard-card">
              {activeRound.players.map(player => (
                <div
                  key={player.id}
                  className="score-row"
                >
                  <span>{player.name}</span>
                  <strong>{skinsTotals[player.id] || 0}</strong>
                </div>
              ))}
            </div>
          </>
        )}

        {hasPoker && (
          <>
            <div className="viewer-section-title">
              <span>3-Putt Poker</span>
              <span>
                ${Number(pokerSettings.buyIn || 0)} buy-in · ${Number(pokerSettings.fineValue || 0)} / fine
              </span>
            </div>

            <div className="scoreboard-card">
              {activeRound.players.map(player => {
                const pokerTotal = pokerTotals[player.id] || {
                  cards: 0,
                  fines: 0
                }

                const cards =
                  pokerHands[player.id] || []

                const bestHand =
                  getBestPokerHand(cards)

                return (
                  <div
                    key={player.id}
                    className="score-row"
                  >
                    <span>
                      {player.name}
                      <small className="viewer-note">
                        {cards.length
                          ? ` · ${cards.map(formatPokerCard).join(' ')}`
                          : ' · No cards yet'}
                      </small>
                    </span>

                    <strong>
                      {bestHand
                        ? bestHand.name
                        : `${pokerTotal.cards} cards`}
                      {' · '}
                      {pokerTotal.fines} fines
                    </strong>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="viewer-section-title">
          <span>{finished ? 'Final Pot' : 'Live Pot'}</span>
          <span>
            {finished ? 'Final balance' : 'Current position'}
          </span>
        </div>

        <div className="scoreboard-card">
          {activeRound.players.map(player => {
            const position =
              combinedPositions[player.id] || {
                wolf: 0,
                skins: 0,
                poker: 0,
                total: 0
              }

            return (
              <div
                key={player.id}
                className="score-row"
              >
                <span>
                  {player.name}
                  <small className="viewer-note">
                    {hasWolf
                      ? ` · Wolf ${formatMoney(position.wolf)}`
                      : ''}
                    {hasSkins
                      ? ` · Skins ${formatMoney(position.skins)}`
                      : ''}
                    {hasPoker
                      ? ` · Poker ${formatMoney(position.poker)}`
                      : ''}
                  </small>
                </span>

                <strong>
                  {formatMoney(position.total)}
                </strong>
              </div>
            )
          })}
        </div>

        {finished && (
          <>
            <div className="success-card">
              <p className="eyebrow">ROUND COMPLETE</p>
              <h2>The pot is settled.</h2>
            </div>

            {settlementPayments.length > 0 && (
              <>
                <div className="viewer-section-title">
                  <span>Settle Up</span>
                  <span>
                    {settlementPayments.length}{' '}
                    {settlementPayments.length === 1
                      ? 'payment'
                      : 'payments'}
                  </span>
                </div>

                <div className="scoreboard-card">
                  {settlementPayments.map(
                    (payment, index) => (
                      <div
                        key={`${payment.from.id}-${payment.to.id}-${index}`}
                        className="score-row"
                      >
                        <span>
                          {payment.from.name} pays{' '}
                          {payment.to.name}
                        </span>

                        <strong>
                          ${payment.amount.toFixed(2)}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              </>
            )}

            {hasPoker &&
              pokerSettlement?.outcome?.status === 'winner' && (
                <div className="success-card">
                  <p className="eyebrow">
                    POKER WINNER
                  </p>

                  <h2>
                    {pokerSettlement.outcome.winner.player.name}
                    {' · '}
                    {pokerSettlement.outcome.winner.hand.name}
                  </h2>

                  <p className="success-copy">
                    Winning hand:{' '}
                    {pokerSettlement.outcome.winner.hand.cards
                      .map(formatPokerCard)
                      .join(' ')}
                  </p>

                  <div className="player-list">
                    {pokerSettlement.payments.map(payment => (
                      <div
                        key={payment.player.id}
                        className="player-pill"
                      >
                        {payment.player.name} owes $
                        {payment.total.toFixed(2)}
                      </div>
                    ))}
                  </div>

                  <p className="success-copy">
                    Total received: $
                    {pokerSettlement.winnerReceives.toFixed(2)}
                  </p>
                </div>
              )}

            {hasPoker &&
              pokerOutcome?.status === 'tie' && (
                <div className="error-message">
                  Poker finished in an exact tie between{' '}
                  {pokerOutcome.winners
                    .map(item => item.player.name)
                    .join(' and ')}.
                  Settle the Poker pot manually.
                </div>
              )}

            {hasPoker &&
              pokerOutcome?.status === 'no-winner' && (
                <div className="error-message">
                  No player has five Poker cards, so there is no automatic Poker winner.
                </div>
              )}
          </>
        )}

        {(finished || activeRound.holeIndex > 0) && (
          <button
            type="button"
            className="secondary-button spaced-action-button"
            onClick={undoLastHole}
            disabled={loading}
          >
            {loading ? 'Working...' : 'Undo Last Hole'}
          </button>
        )}

        {finished && error && (
          <div className="error-message">
            {error}
          </div>
        )}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="create-shell">
        <button className="back-button" onClick={() => setScreen('home')}>
          ← Back
        </button>

        <img
          src="/brand/the-pot-logo.png"
          alt="THE POT"
          className="brand-logo small-logo"
        />

        <div className="create-header">
          <p className="eyebrow">NEW ROUND</p>
          <h1>Create the pot.</h1>

          <p className="intro">
            Choose the group, pick the games and set the stakes.
          </p>
        </div>

        <div className="form-card">
          <div className="form-section">
            <h2>Players</h2>

            <div className="segmented">
              {[2, 3, 4].map(count => (
                <button
                  key={count}
                  className={playerCount === count ? 'segment active' : 'segment'}
                  onClick={() => setPlayerCount(count)}
                  type="button"
                >
                  {count}
                </button>
              ))}
            </div>

            <div className="player-inputs">
              {players.slice(0, playerCount).map((player, index) => (
                <input
                  key={index}
                  value={player}
                  onChange={e => updatePlayer(index, e.target.value)}
                  placeholder={`Player ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="form-section">
            <h2>Starting Hole</h2>

            <select
              value={startingHole}
              onChange={e => setStartingHole(e.target.value)}
            >
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                <option key={hole} value={hole}>
                  Hole {hole}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <h2>Games</h2>

            <label className="game-toggle">
              <input
                type="checkbox"
                checked={wolfEnabled}
                onChange={e => setWolfEnabled(e.target.checked)}
              />
              <span>Wolf</span>
            </label>

            {wolfEnabled && (
              <div className="settings-grid">
                <label>
                  $ / Point
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={wolfDollarPoint}
                    onChange={e => setWolfDollarPoint(e.target.value)}
                  />
                </label>

                <label>
                  Birdie Multiplier
                  <select
                    value={birdieMultiplier}
                    onChange={e => setBirdieMultiplier(e.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map(value => (
                      <option key={value} value={value}>
                        ×{value}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Eagle Multiplier
                  <select
                    value={eagleMultiplier}
                    onChange={e => setEagleMultiplier(e.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map(value => (
                      <option key={value} value={value}>
                        ×{value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <label className="game-toggle">
              <input
                type="checkbox"
                checked={skinsEnabled}
                onChange={e => setSkinsEnabled(e.target.checked)}
              />
              <span>Skins</span>
            </label>

            {skinsEnabled && (
              <div className="settings-grid">
                <label>
                  Mode
                  <select
                    value={skinsMode}
                    onChange={e => setSkinsMode(e.target.value)}
                  >
                    <option value="individual">Individual</option>
                    <option value="team">Team</option>
                  </select>
                </label>

                <label>
                  $ / Skin
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={skinsDollar}
                    onChange={e => setSkinsDollar(e.target.value)}
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={skinsCarryovers}
                    onChange={e => setSkinsCarryovers(e.target.checked)}
                  />
                  Carryovers
                </label>
              </div>
            )}

            <label className="game-toggle">
              <input
                type="checkbox"
                checked={pokerEnabled}
                onChange={e => setPokerEnabled(e.target.checked)}
              />
              <span>3-Putt Poker</span>
            </label>

            {pokerEnabled && (
              <div className="settings-grid">
                <label>
                  Buy-In $
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pokerBuyIn}
                    onChange={e =>
                      setPokerBuyIn(e.target.value)
                    }
                  />
                </label>

                <label>
                  Fine Value $
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={pokerFineValue}
                    onChange={e =>
                      setPokerFineValue(e.target.value)
                    }
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="primary-button create-button"
            onClick={createRound}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Round'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default App