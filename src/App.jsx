import { useEffect, useState } from 'react'
import './App.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/bricolage-grotesque/700.css'
import { supabase } from './lib/supabase'

function makeEventCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''

  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  return code
}

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

function getSkinsTeams(round) {
  const settings = getSkinsSettings(round)
  if (settings.mode !== 'team') return []

  const teamOneOrders = settings.teamOneOrders || [1, 2]
  const teamTwoOrders = settings.teamTwoOrders || [3, 4]

  const makeTeam = (id, orders) => {
    const players = orders
      .map(order => round.players.find(player => Number(player.player_order) === Number(order)))
      .filter(Boolean)

    return { id, players, label: players.map(player => player.name).join(' + ') }
  }

  return [makeTeam('team1', teamOneOrders), makeTeam('team2', teamTwoOrders)]
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
  const settings = getSkinsSettings(round)

  round.players.forEach(player => { totals[player.id] = 0 })

  if (settings.mode === 'team') {
    const teams = getSkinsTeams(round)
    results.forEach(result => {
      if (!result.winner_team || Number(result.skins_won) <= 0) return
      const winningTeam = teams.find(team => team.id === result.winner_team)
      winningTeam?.players.forEach(player => {
        totals[player.id] += Number(result.skins_won)
      })
    })
    return totals
  }

  results.forEach(result => {
    if (result.winner_player_id && Number(result.skins_won) > 0) {
      totals[result.winner_player_id] += Number(result.skins_won)
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


function getBestDisplayPokerHand(cards) {
  if (!cards.length) {
    return null
  }

  if (cards.length >= 5) {
    return getBestPokerHand(cards)
  }

  const ranks = cards
    .map(cardRankValue)
    .sort((a, b) => b - a)

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

  if (groups[0].count === 4) {
    return {
      category: 7,
      name: 'Four of a Kind',
      tiebreak: [groups[0].rank],
      cards
    }
  }

  if (groups[0].count === 3) {
    return {
      category: 3,
      name: 'Three of a Kind',
      tiebreak: [
        groups[0].rank,
        ...groups
          .slice(1)
          .map(group => group.rank)
          .sort((a, b) => b - a)
      ],
      cards
    }
  }

  if (
    groups[0].count === 2 &&
    groups[1]?.count === 2
  ) {
    const pairRanks = [
      groups[0].rank,
      groups[1].rank
    ].sort((a, b) => b - a)

    return {
      category: 2,
      name: 'Two Pair',
      tiebreak: pairRanks,
      cards
    }
  }

  if (groups[0].count === 2) {
    return {
      category: 1,
      name: 'One Pair',
      tiebreak: [
        groups[0].rank,
        ...groups
          .slice(1)
          .map(group => group.rank)
          .sort((a, b) => b - a)
      ],
      cards
    }
  }

  return {
    category: 0,
    name: 'High Card',
    tiebreak: ranks,
    cards
  }
}

function getPokerOutcome(round, results) {
  const playerCards =
    calculatePokerHands(round, results)

  const evaluatedPlayers =
    round.players.map(player => ({
      player,
      cards: playerCards[player.id] || [],
      hand: getBestDisplayPokerHand(
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

async function ensureAnonymousUser() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()

  if (sessionError) throw sessionError
  if (session?.user) return session.user

  const {
    data,
    error: signInError
  } = await supabase.auth.signInAnonymously()

  if (signInError) throw signInError
  if (!data?.user) {
    throw new Error('Could not start your session.')
  }

  return data.user
}

function App() {
  const [screen, setScreen] = useState('home')

  const [playerCount, setPlayerCount] = useState(4)
  const [players, setPlayers] = useState(['', '', '', ''])
  const [playerProfileIds, setPlayerProfileIds] = useState([null, null, null, null])
  const [startingHole, setStartingHole] = useState(1)

  const [wolfEnabled, setWolfEnabled] = useState(true)
  const [skinsEnabled, setSkinsEnabled] = useState(false)
  const [pokerEnabled, setPokerEnabled] = useState(false)

  const [wolfDollarPoint, setWolfDollarPoint] = useState(1)
  const [birdieMultiplier, setBirdieMultiplier] = useState(2)
  const [eagleMultiplier, setEagleMultiplier] = useState(3)

  const [skinsMode, setSkinsMode] = useState('individual')
  const [skinsTeamPairing, setSkinsTeamPairing] = useState('12v34')
  const [skinsDollar, setSkinsDollar] = useState(5)
  const [skinsCarryovers, setSkinsCarryovers] = useState(true)

  const [pokerFineValue, setPokerFineValue] = useState(2)
  const [pokerBuyIn, setPokerBuyIn] = useState(10)

  const [joinCode, setJoinCode] = useState('')
  const [joinedRound, setJoinedRound] = useState(null)

  const [loading, setLoading] = useState(false)
  const [shareStatus, setShareStatus] = useState('')
  const [recoveringHost, setRecoveringHost] = useState(true)
  const [createdRound, setCreatedRound] = useState(null)
  const [error, setError] = useState('')

  const [authUser, setAuthUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [savedGolfers, setSavedGolfers] = useState([])
  const [newGolferName, setNewGolferName] = useState('')
  const [newGolferCode, setNewGolferCode] = useState('')
  const [golfersLoading, setGolfersLoading] = useState(false)
  const [savedGroups, setSavedGroups] = useState([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupSelections, setNewGroupSelections] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [roundHistory, setRoundHistory] = useState([])
  const [seasonStandings, setSeasonStandings] = useState([])
  const [seasonLoading, setSeasonLoading] = useState(false)
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())


  // Tournament / Event Stage 1
  const [eventName, setEventName] = useState('')
  const [eventScoringBasis, setEventScoringBasis] = useState('nett')
  const [eventEntryPlayerCount, setEventEntryPlayerCount] = useState(4)
  const [eventEntryPlayerNames, setEventEntryPlayerNames] = useState(Array(4).fill(''))
  const [eventEntryProfileIds, setEventEntryProfileIds] = useState(Array(4).fill(null))
  const [createdEvent, setCreatedEvent] = useState(null)
  const [joinedEvent, setJoinedEvent] = useState(null)
  const [joinedEventGroup, setJoinedEventGroup] = useState(null)
  const [eventJoinCode, setEventJoinCode] = useState('')
  const [eventLoading, setEventLoading] = useState(false)

  // Tournament / Event Stage 2 — hole scoring + live leaderboard
  const [eventCurrentHole, setEventCurrentHole] = useState(1)
  const [eventHolePar, setEventHolePar] = useState(4)
  const [eventHoleScores, setEventHoleScores] = useState({})
  const [eventScoreLoading, setEventScoreLoading] = useState(false)

  // Tournament / Event Stage 3 — group side games
  const [eventWolfEnabled, setEventWolfEnabled] = useState(false)
  const [eventSkinsEnabled, setEventSkinsEnabled] = useState(false)
  const [eventPokerEnabled, setEventPokerEnabled] = useState(false)

  const [eventWolfDollarPoint, setEventWolfDollarPoint] = useState(1)
  const [eventBirdieMultiplier, setEventBirdieMultiplier] = useState(2)
  const [eventEagleMultiplier, setEventEagleMultiplier] = useState(3)

  const [eventSkinsMode, setEventSkinsMode] = useState('individual')
  const [eventSkinsTeamPairing, setEventSkinsTeamPairing] = useState('12v34')
  const [eventSkinsDollar, setEventSkinsDollar] = useState(5)
  const [eventSkinsCarryovers, setEventSkinsCarryovers] = useState(true)

  const [eventPokerFineValue, setEventPokerFineValue] = useState(2)
  const [eventPokerBuyIn, setEventPokerBuyIn] = useState(10)

  const [eventSideRound, setEventSideRound] = useState(null)
  const [eventWolfResults, setEventWolfResults] = useState([])
  const [eventSkinsResults, setEventSkinsResults] = useState([])
  const [eventPokerResults, setEventPokerResults] = useState([])
  const [eventWolfPlayerId, setEventWolfPlayerId] = useState('')
  const [eventWolfPartnerId, setEventWolfPartnerId] = useState('')
  const [eventPokerSelections, setEventPokerSelections] = useState({})

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

  function getSeasonPointScale(playerCount) {
    if (playerCount === 4) return [100, 70, 50, 30]
    if (playerCount === 3) return [100, 65, 40]
    return [100, 50]
  }

  function buildSeasonRows(round, wolfRows, skinsRows, pokerRows) {
    const combined = calculateCombinedPositions(round, wolfRows, skinsRows, pokerRows)
    const sorted = [...round.players]
      .map(player => ({
        player,
        total: Math.round(Number(combined[player.id]?.total || 0) * 100) / 100
      }))
      .sort((a, b) => b.total - a.total)

    const pointScale = getSeasonPointScale(round.players.length)
    const completedAt = new Date().toISOString()
    const currentYear = new Date().getFullYear()
    const rows = []

    let index = 0
    while (index < sorted.length) {
      let end = index
      while (
        end + 1 < sorted.length &&
        Math.abs(sorted[end + 1].total - sorted[index].total) < 0.005
      ) {
        end += 1
      }

      const tied = end > index
      const points = pointScale.slice(index, end + 1)
      const averagedPoints = points.length
        ? points.reduce((sum, value) => sum + value, 0) / points.length
        : 0

      for (let positionIndex = index; positionIndex <= end; positionIndex += 1) {
        const entry = sorted[positionIndex]
        if (!entry.player.profile_id) continue

        rows.push({
          round_id: round.id,
          profile_id: entry.player.profile_id,
          season_year: currentYear,
          final_position: index + 1,
          is_tie: tied,
          pot_total: entry.total,
          season_points: Math.round(averagedPoints * 100) / 100,
          player_count: round.players.length,
          completed_at: completedAt,
          updated_at: completedAt
        })
      }

      index = end + 1
    }

    return rows
  }

  async function recordSeasonResults(round, wolfRows, skinsRows, pokerRows) {
    const rows = buildSeasonRows(round, wolfRows, skinsRows, pokerRows)
    if (!rows.length) return

    const { error: seasonError } = await supabase
      .from('season_results')
      .upsert(rows, { onConflict: 'round_id,profile_id' })

    if (seasonError) throw seasonError
  }

  async function loadSeasonData(profileId, year = new Date().getFullYear()) {
    if (!profileId) {
      setRoundHistory([])
      setSeasonStandings([])
      return
    }

    setSeasonLoading(true)
    setError('')

    try {
      const { data, error: seasonError } = await supabase
        .from('season_results')
        .select(`
          round_id,
          profile_id,
          season_year,
          final_position,
          is_tie,
          pot_total,
          season_points,
          player_count,
          completed_at,
          profiles ( display_name, golfer_code ),
          rounds ( round_code )
        `)
        .eq('season_year', year)
        .order('completed_at', { ascending: false })

      if (seasonError) throw seasonError

      const rows = data || []
      setRoundHistory(rows.filter(row => row.profile_id === profileId))

      const byProfile = new Map()
      rows.forEach(row => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
        const name = profile?.display_name || 'THE POT golfer'
        const existing = byProfile.get(row.profile_id) || {
          profile_id: row.profile_id,
          display_name: name,
          rounds: 0,
          wins: 0,
          points: 0,
          netPot: 0
        }

        existing.rounds += 1
        if (Number(row.final_position) === 1) existing.wins += 1
        existing.points += Number(row.season_points || 0)
        existing.netPot += Number(row.pot_total || 0)
        byProfile.set(row.profile_id, existing)
      })

      const standings = [...byProfile.values()]
        .map(item => ({
          ...item,
          points: Math.round(item.points * 100) / 100,
          netPot: Math.round(item.netPot * 100) / 100
        }))
        .sort((a, b) =>
          b.points - a.points ||
          b.netPot - a.netPot ||
          a.display_name.localeCompare(b.display_name)
        )

      setSeasonStandings(standings)
      setSeasonYear(year)
    } catch (seasonError) {
      console.error(seasonError)
      setError(seasonError.message || 'Could not load season data.')
    } finally {
      setSeasonLoading(false)
    }
  }

  async function openSeasonScreen(target) {
    if (!userProfile?.id) return
    await loadSeasonData(userProfile.id, new Date().getFullYear())
    setScreen(target)
  }

  function formatHistoryDate(value) {
    if (!value) return ''
    return new Intl.DateTimeFormat('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value))
  }

  function formatMoney(value) {
    const amount = Number(value || 0)
    const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
    return `${sign}$${Math.abs(amount).toFixed(2)}`
  }

  async function loadSavedGolfers(userId) {
    if (!userId) {
      setSavedGolfers([])
      return []
    }

    const { data, error: golfersError } = await supabase
      .from('saved_golfers')
      .select('id, display_name, linked_profile_id, created_at')
      .eq('owner_user_id', userId)
      .order('display_name', { ascending: true })

    if (golfersError) throw golfersError

    setSavedGolfers(data || [])
    return data || []
  }

  async function addSavedGolfer() {
    const displayName = newGolferName.trim()

    if (!displayName) {
      setError('Enter your playing partner\'s name.')
      return
    }

    if (!authUser?.id) {
      setError('Create your profile before saving playing partners.')
      return
    }

    if (savedGolfers.some(golfer => golfer.display_name.toLowerCase() === displayName.toLowerCase())) {
      setError(`${displayName} is already in My Golfers.`)
      return
    }

    setGolfersLoading(true)
    setError('')

    try {
      const { data, error: golferError } = await supabase
        .from('saved_golfers')
        .insert({
          owner_user_id: authUser.id,
          display_name: displayName
        })
        .select('id, display_name, linked_profile_id, created_at')
        .single()

      if (golferError) throw golferError

      setSavedGolfers(current =>
        [...current, data].sort((a, b) => a.display_name.localeCompare(b.display_name))
      )
      setNewGolferName('')
    } catch (golferError) {
      console.error(golferError)
      setError(golferError.message || 'Could not save this golfer.')
    } finally {
      setGolfersLoading(false)
    }
  }

  async function linkSavedGolferByCode() {
    const code = newGolferCode.trim().toUpperCase().replace(/\s+/g, '')

    if (!code) {
      setError('Enter their THE POT golfer code.')
      return
    }

    if (!authUser?.id) {
      setError('Create your profile before linking playing partners.')
      return
    }

    setGolfersLoading(true)
    setError('')

    try {
      const { data: linkedProfile, error: lookupError } = await supabase
        .from('profiles')
        .select('id, display_name, golfer_code')
        .eq('golfer_code', code)
        .maybeSingle()

      if (lookupError) throw lookupError
      if (!linkedProfile) {
        setError('No THE POT golfer was found with that code.')
        return
      }
      if (linkedProfile.id === authUser.id) {
        setError('That is your own golfer code.')
        return
      }
      if (savedGolfers.some(golfer => golfer.linked_profile_id === linkedProfile.id)) {
        setError(`${linkedProfile.display_name} is already linked in My Golfers.`)
        return
      }

      const { data, error: golferError } = await supabase
        .from('saved_golfers')
        .insert({
          owner_user_id: authUser.id,
          display_name: linkedProfile.display_name,
          linked_profile_id: linkedProfile.id
        })
        .select('id, display_name, linked_profile_id, created_at')
        .single()

      if (golferError) throw golferError

      setSavedGolfers(current =>
        [...current, data].sort((a, b) => a.display_name.localeCompare(b.display_name))
      )
      setNewGolferCode('')
    } catch (golferError) {
      console.error(golferError)
      setError(golferError.message || 'Could not link this golfer.')
    } finally {
      setGolfersLoading(false)
    }
  }

  async function removeSavedGolfer(golfer) {
    if (!window.confirm(`Remove ${golfer.display_name} from My Golfers?`)) return

    setGolfersLoading(true)
    setError('')

    try {
      const { error: golferError } = await supabase
        .from('saved_golfers')
        .delete()
        .eq('id', golfer.id)

      if (golferError) throw golferError

      setSavedGolfers(current => current.filter(item => item.id !== golfer.id))
    } catch (golferError) {
      console.error(golferError)
      setError(golferError.message || 'Could not remove this golfer.')
    } finally {
      setGolfersLoading(false)
    }
  }

  async function loadSavedGroups(userId) {
    if (!userId) {
      setSavedGroups([])
      return []
    }

    const { data, error: groupsError } = await supabase
      .from('saved_groups')
      .select(`
        id,
        name,
        created_at,
        saved_group_members (
          id,
          display_name,
          profile_id,
          member_order
        )
      `)
      .eq('owner_user_id', userId)
      .order('name', { ascending: true })

    if (groupsError) throw groupsError

    const groups = (data || []).map(group => ({
      ...group,
      members: [...(group.saved_group_members || [])].sort(
        (a, b) => Number(a.member_order) - Number(b.member_order)
      )
    }))

    setSavedGroups(groups)
    return groups
  }

  function getGroupChoices() {
    const choices = []

    if (userProfile) {
      choices.push({
        key: `profile:${userProfile.id}`,
        display_name: userProfile.display_name,
        profile_id: userProfile.id,
        label: 'You'
      })
    }

    savedGolfers.forEach(golfer => {
      choices.push({
        key: golfer.linked_profile_id
          ? `profile:${golfer.linked_profile_id}`
          : `guest:${golfer.id}`,
        display_name: golfer.display_name,
        profile_id: golfer.linked_profile_id || null,
        label: golfer.linked_profile_id ? 'Linked' : 'Guest'
      })
    })

    return choices
  }

  function toggleNewGroupMember(choiceKey) {
    setNewGroupSelections(current => {
      if (current.includes(choiceKey)) {
        return current.filter(key => key !== choiceKey)
      }

      if (current.length >= 4) {
        setError('A saved group can have a maximum of 4 golfers.')
        return current
      }

      setError('')
      return [...current, choiceKey]
    })
  }

  async function createSavedGroup() {
    const groupName = newGroupName.trim()
    const choices = getGroupChoices()
    const selected = newGroupSelections
      .map(key => choices.find(choice => choice.key === key))
      .filter(Boolean)

    if (!groupName) {
      setError('Give this group a name.')
      return
    }

    if (!authUser?.id) {
      setError('Create your profile before saving a group.')
      return
    }

    if (selected.length < 2 || selected.length > 4) {
      setError('Choose between 2 and 4 golfers for this group.')
      return
    }

    if (savedGroups.some(group => group.name.toLowerCase() === groupName.toLowerCase())) {
      setError(`You already have a saved group called ${groupName}.`)
      return
    }

    setGroupsLoading(true)
    setError('')

    let createdGroup = null

    try {
      const { data: group, error: groupError } = await supabase
        .from('saved_groups')
        .insert({
          owner_user_id: authUser.id,
          name: groupName
        })
        .select('id, name, created_at')
        .single()

      if (groupError) throw groupError
      createdGroup = group

      const members = selected.map((choice, index) => ({
        group_id: group.id,
        display_name: choice.display_name,
        profile_id: choice.profile_id,
        member_order: index + 1
      }))

      const { error: membersError } = await supabase
        .from('saved_group_members')
        .insert(members)

      if (membersError) throw membersError

      await loadSavedGroups(authUser.id)
      setNewGroupName('')
      setNewGroupSelections([])
    } catch (groupError) {
      console.error(groupError)

      if (createdGroup?.id) {
        await supabase
          .from('saved_groups')
          .delete()
          .eq('id', createdGroup.id)
      }

      setError(groupError.message || 'Could not save this group.')
    } finally {
      setGroupsLoading(false)
    }
  }

  async function removeSavedGroup(group) {
    if (!window.confirm(`Remove ${group.name} from Saved Groups?`)) return

    setGroupsLoading(true)
    setError('')

    try {
      const { error: groupError } = await supabase
        .from('saved_groups')
        .delete()
        .eq('id', group.id)

      if (groupError) throw groupError

      setSavedGroups(current => current.filter(item => item.id !== group.id))
    } catch (groupError) {
      console.error(groupError)
      setError(groupError.message || 'Could not remove this group.')
    } finally {
      setGroupsLoading(false)
    }
  }

  function loadSavedGroup(group, openRound = false) {
    const members = [...(group.members || [])]
      .sort((a, b) => Number(a.member_order) - Number(b.member_order))
      .slice(0, 4)

    if (members.length < 2) {
      setError('This saved group does not have enough golfers.')
      return
    }

    const nextNames = Array(4).fill('')
    const nextIds = Array(4).fill(null)

    members.forEach((member, index) => {
      nextNames[index] = member.display_name
      nextIds[index] = member.profile_id || null
    })

    setPlayerCount(members.length)
    setPlayers(nextNames)
    setPlayerProfileIds(nextIds)
    setError('')

    if (openRound) setScreen('create')
  }

  function toggleRoundGolfer(golfer) {
    const cleanName = golfer.display_name.trim()
    if (!cleanName) return

    const profileId = golfer.profile_id || golfer.linked_profile_id || null
    const active = players.slice(0, playerCount)
    const activeIds = playerProfileIds.slice(0, playerCount)
    const existingIndex = profileId
      ? activeIds.findIndex(id => id === profileId)
      : active.findIndex(player => player.trim().toLowerCase() === cleanName.toLowerCase())

    if (existingIndex >= 0) {
      const remainingNames = active.filter((_, index) => index !== existingIndex)
      const remainingIds = activeIds.filter((_, index) => index !== existingIndex)
      const nextNames = [...remainingNames, ...Array(playerCount - remainingNames.length).fill(''), ...players.slice(playerCount)]
      const nextIds = [...remainingIds, ...Array(playerCount - remainingIds.length).fill(null), ...playerProfileIds.slice(playerCount)]
      setPlayers(nextNames.slice(0, 4))
      setPlayerProfileIds(nextIds.slice(0, 4))
      setError('')
      return
    }

    const emptyIndex = active.findIndex(player => !player.trim())
    if (emptyIndex < 0) {
      setError(`All ${playerCount} player spots are filled.`)
      return
    }

    const nextNames = [...players]
    const nextIds = [...playerProfileIds]
    nextNames[emptyIndex] = cleanName
    nextIds[emptyIndex] = profileId
    setPlayers(nextNames)
    setPlayerProfileIds(nextIds)
    setError('')
  }

  function resetEventGroupEntry() {
    setEventEntryPlayerCount(4)
    setEventEntryPlayerNames(Array(4).fill(''))
    setEventEntryProfileIds(Array(4).fill(null))

    setEventWolfEnabled(false)
    setEventSkinsEnabled(false)
    setEventPokerEnabled(false)

    setEventWolfDollarPoint(1)
    setEventBirdieMultiplier(2)
    setEventEagleMultiplier(3)

    setEventSkinsMode('individual')
    setEventSkinsTeamPairing('12v34')
    setEventSkinsDollar(5)
    setEventSkinsCarryovers(true)

    setEventPokerFineValue(2)
    setEventPokerBuyIn(10)
  }

  function updateEventEntryPlayer(index, value) {
    setEventEntryPlayerNames(current => {
      const next = [...current]
      next[index] = value
      return next
    })
    setEventEntryProfileIds(current => {
      const next = [...current]
      next[index] = null
      return next
    })
  }

  function loadSavedGroupIntoEvent(group) {
    const members = [...(group.members || [])].slice(0, 4)
    if (members.length < 2) {
      setError('That saved group does not have enough golfers.')
      return
    }

    setEventEntryPlayerCount(members.length)
    setEventEntryPlayerNames([
      ...members.map(member => member.display_name),
      ...Array(4 - members.length).fill('')
    ])
    setEventEntryProfileIds([
      ...members.map(member => member.profile_id || null),
      ...Array(4 - members.length).fill(null)
    ])
    setError('')
  }

  async function generateUniqueEventCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = makeEventCode()

      const { data, error: codeError } = await supabase
        .from('events')
        .select('id')
        .eq('event_code', code)
        .maybeSingle()

      if (codeError) throw codeError
      if (!data) return code
    }

    throw new Error('Could not generate a unique event code.')
  }

  async function fetchEventByCode(code) {
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('event_code', code)
      .maybeSingle()

    if (eventError) throw eventError
    if (!event) return null

    const { data: groups, error: groupsError } = await supabase
      .from('event_groups')
      .select('*')
      .eq('event_id', event.id)
      .order('group_number')

    if (groupsError) throw groupsError

    const { data: eventPlayers, error: playersError } = await supabase
      .from('event_players')
      .select('*')
      .eq('event_id', event.id)
      .order('player_order')

    if (playersError) throw playersError

    const { data: eventHoles, error: holesError } = await supabase
      .from('event_holes')
      .select('*')
      .eq('event_id', event.id)
      .order('hole_number')

    if (holesError) throw holesError

    const { data: eventScores, error: scoresError } = await supabase
      .from('event_hole_scores')
      .select('*')
      .eq('event_id', event.id)
      .order('hole_number')

    if (scoresError) throw scoresError

    const hydratedGroups = (groups || []).map(group => ({
      ...group,
      players: (eventPlayers || [])
        .filter(player => player.group_id === group.id)
        .sort((a, b) => Number(a.player_order) - Number(b.player_order))
    }))

    return {
      ...event,
      groups: hydratedGroups,
      holes: eventHoles || [],
      scores: eventScores || []
    }
  }

  async function refreshEvent(eventId, setter = setJoinedEvent) {
    if (!eventId) return null

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError) throw eventError

    const fullEvent = await fetchEventByCode(event.event_code)
    setter(fullEvent)
    return fullEvent
  }

  function getEventShareUrl(code) {
    const url = new URL(window.location.origin)
    url.searchParams.set('event', code)
    return url.toString()
  }

  function syncEventUrl(code) {
    if (!code) return

    const url = new URL(window.location.href)
    url.searchParams.delete('round')
    url.searchParams.set('event', code)
    window.history.replaceState({}, '', url)
  }

  function clearEventUrl() {
    const url = new URL(window.location.href)
    url.searchParams.delete('event')
    window.history.replaceState({}, '', url)
  }

  async function shareEvent(code) {
    const shareUrl = getEventShareUrl(code)
    setShareStatus('')

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'THE POT',
          text: `Follow the event live on THE POT · ${code}`,
          url: shareUrl
        })
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('Link copied')
    } catch (err) {
      if (err?.name === 'AbortError') return

      try {
        await navigator.clipboard.writeText(shareUrl)
        setShareStatus('Link copied')
      } catch (copyError) {
        console.error(copyError)
        setShareStatus(shareUrl)
      }
    }
  }

  function leaveEvent() {
    clearEventUrl()
    setJoinedEvent(null)
    setJoinedEventGroup(null)
    setCreatedEvent(null)
    setEventSideRound(null)
    setEventWolfResults([])
    setEventSkinsResults([])
    setEventPokerResults([])
    setEventJoinCode('')
    setError('')
    setShareStatus('')
    setScreen('home')
  }

  function openCreateEvent() {
    clearEventUrl()
    setError('')
    setEventName('')
    setEventScoringBasis('nett')
    resetEventGroupEntry()
    setScreen('create-event')
  }

  async function createEvent() {
    setError('')

    const cleanName = eventName.trim()
    if (!cleanName) {
      setError('Enter an event name.')
      return
    }

    setEventLoading(true)
    let insertedEventId = null

    try {
      const organiser = await ensureAnonymousUser()
      const eventCode = await generateUniqueEventCode()

      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          event_code: eventCode,
          name: cleanName,
          scoring_basis: eventScoringBasis,
          organiser_user_id: organiser.id,
          status: 'setup'
        })
        .select()
        .single()

      if (eventError) throw eventError
      insertedEventId = event.id

      const fullEvent = { ...event, groups: [] }
      setCreatedEvent(fullEvent)
      setJoinedEvent(fullEvent)
      syncEventUrl(fullEvent.event_code)
      setScreen('event-created')
    } catch (eventError) {
      console.error(eventError)

      if (insertedEventId) {
        await supabase.from('events').delete().eq('id', insertedEventId)
      }

      setError(eventError.message || 'Could not create the event.')
    } finally {
      setEventLoading(false)
    }
  }

  async function findEvent() {
    setError('')
    const code = eventJoinCode.trim().toUpperCase()

    if (code.length !== 5) {
      setError('Enter the 5-character event code.')
      return
    }

    setEventLoading(true)
    try {
      const scorer = await ensureAnonymousUser()
      const event = await fetchEventByCode(code)
      if (!event) {
        setError('Event not found. Check the code and try again.')
        return
      }

      setJoinedEvent(event)
      syncEventUrl(event.event_code)
      const existingGroup = event.groups.find(group => group.scorer_user_id === scorer.id)
      setJoinedEventGroup(existingGroup || null)
      if (!existingGroup) resetEventGroupEntry()
    } catch (eventError) {
      console.error(eventError)
      setError(eventError.message || 'Could not find the event.')
    } finally {
      setEventLoading(false)
    }
  }

  async function fetchEventSideRound(roundId) {
    if (!roundId) return null

    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('*')
      .eq('id', roundId)
      .single()

    if (roundError) throw roundError

    const { data: roundPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('round_id', roundId)
      .order('player_order')

    if (playersError) throw playersError

    const { data: games, error: gamesError } = await supabase
      .from('round_games')
      .select('*')
      .eq('round_id', roundId)

    if (gamesError) throw gamesError

    const [wolfResponse, skinsResponse, pokerResponse] = await Promise.all([
      supabase.from('wolf_results').select('*').eq('round_id', roundId).order('hole'),
      supabase.from('skins_results').select('*').eq('round_id', roundId).order('hole'),
      supabase.from('poker_results').select('*').eq('round_id', roundId).order('hole')
    ])

    if (wolfResponse.error) throw wolfResponse.error
    if (skinsResponse.error) throw skinsResponse.error
    if (pokerResponse.error) throw pokerResponse.error

    return {
      ...round,
      players: roundPlayers || [],
      games: games || [],
      wolfResults: wolfResponse.data || [],
      skinsResults: skinsResponse.data || [],
      pokerResults: pokerResponse.data || []
    }
  }

  function buildEventGameRows(roundId) {
    const rows = []

    if (eventWolfEnabled) {
      rows.push({
        round_id: roundId,
        game_type: 'wolf',
        settings: {
          dollarsPerPoint: Number(eventWolfDollarPoint),
          birdieMultiplier: Number(eventBirdieMultiplier),
          eagleMultiplier: Number(eventEagleMultiplier)
        }
      })
    }

    if (eventSkinsEnabled) {
      rows.push({
        round_id: roundId,
        game_type: 'skins',
        settings: {
          mode: eventSkinsMode,
          dollarsPerSkin: Number(eventSkinsDollar),
          carryovers: eventSkinsCarryovers,
          ...(eventSkinsMode === 'team'
            ? {
                teamOneOrders:
                  eventSkinsTeamPairing === '12v34'
                    ? [1, 2]
                    : eventSkinsTeamPairing === '13v24'
                      ? [1, 3]
                      : [1, 4],
                teamTwoOrders:
                  eventSkinsTeamPairing === '12v34'
                    ? [3, 4]
                    : eventSkinsTeamPairing === '13v24'
                      ? [2, 4]
                      : [2, 3]
              }
            : {})
        }
      })
    }

    if (eventPokerEnabled) {
      rows.push({
        round_id: roundId,
        game_type: 'poker',
        settings: {
          fineValue: Number(eventPokerFineValue),
          buyIn: Number(eventPokerBuyIn)
        }
      })
    }

    return rows
  }

  function makeEventRoundPlayerNameMap(eventGroup, sideRound) {
    const map = new Map()

    ;(eventGroup?.players || []).forEach(eventPlayer => {
      const roundPlayer = (sideRound?.players || []).find(
        player =>
          player.id === eventPlayer.round_player_id ||
          Number(player.player_order) === Number(eventPlayer.player_order)
      )

      if (roundPlayer) map.set(eventPlayer.id, roundPlayer)
    })

    return map
  }

  async function enterEventGroup() {
    if (!joinedEvent) return

    setError('')
    const cleanNames = eventEntryPlayerNames
      .slice(0, eventEntryPlayerCount)
      .map(name => name.trim())

    if (cleanNames.length < 2 || cleanNames.some(name => !name)) {
      setError('Enter each golfer in your group.')
      return
    }

    if (eventWolfEnabled && eventEntryPlayerCount === 2) {
      setError('Wolf requires 3 or 4 golfers.')
      return
    }

    if (eventSkinsEnabled && eventSkinsMode === 'team' && eventEntryPlayerCount !== 4) {
      setError('Team Skins requires exactly 4 golfers.')
      return
    }

    setEventLoading(true)
    let insertedGroupId = null
    let insertedRoundId = null

    try {
      const scorer = await ensureAnonymousUser()
      const freshEvent = await fetchEventByCode(joinedEvent.event_code)
      if (!freshEvent) throw new Error('Event not found.')

      const existingGroup = freshEvent.groups.find(group => group.scorer_user_id === scorer.id)
      if (existingGroup) {
        setJoinedEvent(freshEvent)
        setJoinedEventGroup(existingGroup)
        setScreen('event-lobby')
        return
      }

      const roundCode = await generateUniqueRoundCode()

      const { data: linkedRound, error: roundError } = await supabase
        .from('rounds')
        .insert({
          round_code: roundCode,
          starting_hole: 1,
          current_hole: 1,
          status: 'active',
          host_user_id: scorer.id
        })
        .select()
        .single()

      if (roundError) throw roundError
      insertedRoundId = linkedRound.id

      const roundPlayerRows = cleanNames.map((name, index) => ({
        round_id: linkedRound.id,
        name,
        player_order: index + 1,
        profile_id: eventEntryProfileIds[index] || null
      }))

      const { data: linkedPlayers, error: linkedPlayersError } = await supabase
        .from('players')
        .insert(roundPlayerRows)
        .select()

      if (linkedPlayersError) throw linkedPlayersError

      const gameRows = buildEventGameRows(linkedRound.id)

      if (gameRows.length > 0) {
        const { error: gamesError } = await supabase
          .from('round_games')
          .insert(gameRows)

        if (gamesError) throw gamesError
      }

      const nextGroupNumber = freshEvent.groups.reduce(
        (highest, group) => Math.max(highest, Number(group.group_number) || 0),
        0
      ) + 1

      const { data: group, error: groupError } = await supabase
        .from('event_groups')
        .insert({
          event_id: freshEvent.id,
          group_number: nextGroupNumber,
          scorer_user_id: scorer.id,
          round_id: linkedRound.id,
          status: 'ready'
        })
        .select()
        .single()

      if (groupError) throw groupError
      insertedGroupId = group.id

      const playerRows = cleanNames.map((displayName, playerIndex) => {
        const linkedPlayer = (linkedPlayers || []).find(
          player => Number(player.player_order) === playerIndex + 1
        )

        return {
          event_id: freshEvent.id,
          group_id: group.id,
          display_name: displayName,
          player_order: playerIndex + 1,
          profile_id: eventEntryProfileIds[playerIndex] || null,
          round_player_id: linkedPlayer?.id || null
        }
      })

      const { error: playersError } = await supabase
        .from('event_players')
        .insert(playerRows)

      if (playersError) throw playersError

      const fullEvent = await refreshEvent(freshEvent.id)
      const enteredGroup = fullEvent.groups.find(item => item.id === group.id)
      setJoinedEventGroup(enteredGroup || group)
      syncEventUrl(fullEvent.event_code)
      setScreen('event-lobby')
    } catch (eventError) {
      console.error(eventError)

      if (insertedGroupId) {
        await supabase.from('event_groups').delete().eq('id', insertedGroupId)
      }

      if (insertedRoundId) {
        await supabase.from('rounds').delete().eq('id', insertedRoundId)
      }

      setError(eventError.message || 'Could not enter your group in the event.')
    } finally {
      setEventLoading(false)
    }
  }

  function openEventLobby(event = createdEvent || joinedEvent) {
    if (!event) return
    setJoinedEvent(event)
    syncEventUrl(event.event_code)
    setError('')
    setScreen('event-lobby')
  }

  function getEventHolePar(event, holeNumber) {
    return Number(
      (event?.holes || []).find(hole => Number(hole.hole_number) === Number(holeNumber))?.par || 4
    )
  }

  function getEventPlayerScore(event, playerId, holeNumber) {
    const row = (event?.scores || []).find(
      score =>
        score.event_player_id === playerId &&
        Number(score.hole_number) === Number(holeNumber)
    )

    return row ? Number(row.score) : ''
  }

  function buildEventLeaderboard(event) {
    if (!event) return []

    const parByHole = new Map(
      (event.holes || []).map(hole => [Number(hole.hole_number), Number(hole.par)])
    )

    const players = (event.groups || []).flatMap(group =>
      (group.players || []).map(player => ({
        ...player,
        group_number: Number(group.group_number)
      }))
    )

    const rows = players.map(player => {
      const playerScores = (event.scores || [])
        .filter(score => score.event_player_id === player.id)
        .sort((a, b) => Number(a.hole_number) - Number(b.hole_number))

      let totalScore = 0
      let totalPar = 0

      playerScores.forEach(score => {
        const holeNumber = Number(score.hole_number)
        const par = parByHole.get(holeNumber) || 4
        totalScore += Number(score.score)
        totalPar += par
      })

      return {
        ...player,
        thru: playerScores.length,
        totalScore,
        totalPar,
        toPar: totalScore - totalPar
      }
    })

    rows.sort((a, b) => {
      if (a.thru === 0 && b.thru > 0) return 1
      if (b.thru === 0 && a.thru > 0) return -1
      if (a.toPar !== b.toPar) return a.toPar - b.toPar
      if (a.thru !== b.thru) return b.thru - a.thru
      if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore
      return a.display_name.localeCompare(b.display_name)
    })

    let previousScore = null
    let previousPosition = 0

    return rows.map((row, index) => {
      const sameAsPrevious =
        previousScore &&
        row.thru === previousScore.thru &&
        row.toPar === previousScore.toPar &&
        row.totalScore === previousScore.totalScore

      const position = sameAsPrevious ? previousPosition : index + 1
      previousScore = row
      previousPosition = position

      return { ...row, position }
    })
  }

  function formatEventToPar(value, thru) {
    if (!thru) return '—'
    if (value === 0) return 'E'
    return value > 0 ? `+${value}` : `${value}`
  }

  function hydrateEventHoleForm(event, group, holeNumber, sideRound = eventSideRound) {
    const safeHole = Math.min(18, Math.max(1, Number(holeNumber) || 1))
    setEventCurrentHole(safeHole)
    setEventHolePar(getEventHolePar(event, safeHole))

    const nextScores = {}
    ;(group?.players || []).forEach(player => {
      const existing = getEventPlayerScore(event, player.id, safeHole)
      nextScores[player.id] = existing === '' ? '' : String(existing)
    })
    setEventHoleScores(nextScores)

    if (sideRound) {
      const scheduledWolf = getScheduledWolf(
        sideRound,
        safeHole - 1,
        sideRound.wolfResults || eventWolfResults
      )

      setEventWolfPlayerId(scheduledWolf?.id || '')
      setEventWolfPartnerId('')
      setEventPokerSelections(makePokerSelections(sideRound.players || []))
    }
  }

  async function openEventScoring() {
    if (!joinedEvent?.id || !joinedEventGroup?.id) return

    setError('')
    setEventScoreLoading(true)

    try {
      const fullEvent = await refreshEvent(joinedEvent.id)
      const freshGroup = fullEvent.groups.find(group => group.id === joinedEventGroup.id)

      if (!freshGroup) throw new Error('Your event group could not be found.')

      setJoinedEventGroup(freshGroup)

      let sideRound = null
      if (freshGroup.round_id) {
        sideRound = await fetchEventSideRound(freshGroup.round_id)
        setEventSideRound(sideRound)
        setEventWolfResults(sideRound.wolfResults || [])
        setEventSkinsResults(sideRound.skinsResults || [])
        setEventPokerResults(sideRound.pokerResults || [])
      } else {
        setEventSideRound(null)
        setEventWolfResults([])
        setEventSkinsResults([])
        setEventPokerResults([])
      }

      const targetHole = Number(freshGroup.current_hole) || 1
      hydrateEventHoleForm(fullEvent, freshGroup, targetHole, sideRound)
      syncEventUrl(fullEvent.event_code)
      setScreen('event-scoring')
    } catch (eventError) {
      console.error(eventError)
      setError(eventError.message || 'Could not open event scoring.')
    } finally {
      setEventScoreLoading(false)
    }
  }

  function changeEventHoleScore(playerId, delta) {
    setEventHoleScores(current => {
      const raw = current[playerId]
      const base = raw === '' || raw == null ? eventHolePar : Number(raw)
      const next = Math.min(20, Math.max(1, base + delta))
      return { ...current, [playerId]: String(next) }
    })
  }

  function setEventScoreValue(playerId, value) {
    const digits = String(value).replace(/[^0-9]/g, '')
    const next = digits === '' ? '' : String(Math.min(20, Math.max(1, Number(digits))))
    setEventHoleScores(current => ({ ...current, [playerId]: next }))
  }

  async function goToEventHole(nextHole) {
    if (!joinedEvent?.id || !joinedEventGroup?.id) return
    const safeHole = Math.min(18, Math.max(1, Number(nextHole) || 1))

    try {
      const fullEvent = await refreshEvent(joinedEvent.id)
      const freshGroup = fullEvent.groups.find(group => group.id === joinedEventGroup.id)
      if (!freshGroup) return
      setJoinedEventGroup(freshGroup)

      let sideRound = eventSideRound
      if (freshGroup.round_id) {
        sideRound = await fetchEventSideRound(freshGroup.round_id)
        setEventSideRound(sideRound)
        setEventWolfResults(sideRound.wolfResults || [])
        setEventSkinsResults(sideRound.skinsResults || [])
        setEventPokerResults(sideRound.pokerResults || [])
      }

      hydrateEventHoleForm(fullEvent, freshGroup, safeHole, sideRound)
    } catch (eventError) {
      console.error(eventError)
      setError(eventError.message || 'Could not load that hole.')
    }
  }

  function getEventSideGame(gameType) {
    return eventSideRound?.games?.find(game => game.game_type === gameType) || null
  }

  function getEventSideRoundScore(roundPlayerId, scoreRows, playerMap) {
    const eventPlayerId = [...playerMap.entries()].find(
      ([, roundPlayer]) => roundPlayer.id === roundPlayerId
    )?.[0]

    return scoreRows.find(row => row.player.id === eventPlayerId)?.score ?? null
  }

  function getEventWolfOutcome(scoreRows, playerMap, par) {
    if (!eventSideRound || !eventWolfPlayerId) return null

    const wolf = eventSideRound.players.find(player => player.id === eventWolfPlayerId)
    if (!wolf) return null

    const partner = eventWolfPartnerId
      ? eventSideRound.players.find(player => player.id === eventWolfPartnerId)
      : null

    const wolfSideIds = [wolf.id, ...(partner ? [partner.id] : [])]
    const opponents = eventSideRound.players.filter(player => !wolfSideIds.includes(player.id))

    const wolfSideScores = wolfSideIds
      .map(id => getEventSideRoundScore(id, scoreRows, playerMap))
      .filter(value => Number.isFinite(value))

    const opponentScores = opponents
      .map(player => getEventSideRoundScore(player.id, scoreRows, playerMap))
      .filter(value => Number.isFinite(value))

    if (!wolfSideScores.length || !opponentScores.length) return null

    const wolfBest = Math.min(...wolfSideScores)
    const opponentBest = Math.min(...opponentScores)

    let result = 'tie'
    let winningBest = null

    if (wolfBest < opponentBest) {
      result = 'win'
      winningBest = wolfBest
    } else if (wolfBest > opponentBest) {
      result = 'loss'
      winningBest = opponentBest
    }

    let scoreType = 'normal'
    if (winningBest != null && winningBest <= par - 2) {
      scoreType = 'eagle'
    } else if (winningBest != null && winningBest === par - 1) {
      scoreType = 'birdie'
    }

    const settings = getEventSideGame('wolf')?.settings || {}
    const multiplier =
      result === 'tie'
        ? 1
        : scoreType === 'eagle'
          ? Number(settings.eagleMultiplier || 3)
          : scoreType === 'birdie'
            ? Number(settings.birdieMultiplier || 2)
            : 1

    let stake = 1
    for (let index = eventWolfResults.length - 1; index >= 0; index -= 1) {
      if (eventWolfResults[index].result === 'tie') {
        stake += 1
      } else {
        break
      }
    }

    return {
      round_id: eventSideRound.id,
      hole: eventCurrentHole,
      wolf_player_id: wolf.id,
      partner_player_id: partner?.id || null,
      result,
      stake,
      score_type: scoreType,
      multiplier
    }
  }

  function getEventSkinsOutcome(scoreRows, playerMap) {
    if (!eventSideRound) return null

    const settings = getSkinsSettings(eventSideRound)
    const currentSkinValue = getCurrentSkinsValue(eventSideRound, eventSkinsResults)

    if (settings.mode === 'team') {
      const teams = getSkinsTeams(eventSideRound)
      if (teams.length !== 2) return null

      const teamBest = team => Math.min(
        ...team.players
          .map(player => getEventSideRoundScore(player.id, scoreRows, playerMap))
          .filter(value => Number.isFinite(value))
      )

      const firstBest = teamBest(teams[0])
      const secondBest = teamBest(teams[1])

      if (!Number.isFinite(firstBest) || !Number.isFinite(secondBest)) return null

      const winnerTeam =
        firstBest === secondBest
          ? null
          : firstBest < secondBest
            ? teams[0].id
            : teams[1].id

      return {
        round_id: eventSideRound.id,
        hole: eventCurrentHole,
        winner_player_id: null,
        winner_team: winnerTeam,
        skins_won: winnerTeam
          ? settings.carryovers
            ? currentSkinValue
            : 1
          : 0
      }
    }

    const scoredPlayers = eventSideRound.players
      .map(player => ({
        player,
        score: getEventSideRoundScore(player.id, scoreRows, playerMap)
      }))
      .filter(item => Number.isFinite(item.score))

    if (!scoredPlayers.length) return null

    const lowScore = Math.min(...scoredPlayers.map(item => item.score))
    const winners = scoredPlayers.filter(item => item.score === lowScore)
    const winnerPlayerId = winners.length === 1 ? winners[0].player.id : null

    return {
      round_id: eventSideRound.id,
      hole: eventCurrentHole,
      winner_player_id: winnerPlayerId,
      winner_team: null,
      skins_won: winnerPlayerId
        ? settings.carryovers
          ? currentSkinValue
          : 1
        : 0
    }
  }

  function getEventPokerRows(scoreRows, playerMap, par) {
    if (!eventSideRound) return []

    const deck = createPokerDeck(`${eventSideRound.id}-${eventSideRound.round_code}`)

    const previousResults = eventPokerResults.filter(
      result => Number(result.hole) !== Number(eventCurrentHole)
    )

    let deckPosition = previousResults.reduce(
      (total, result) => total + Number(result.cards_earned || 0),
      0
    )

    return eventSideRound.players.map(player => {
      const selection = {
        ...(eventPokerSelections[player.id] || makeEmptyPokerSelection())
      }

      const score = getEventSideRoundScore(player.id, scoreRows, playerMap)

      if (joinedEvent?.scoring_basis === 'nett' && Number.isFinite(score)) {
        selection.nettBirdie = score === par - 1
        selection.nettEagle = score === par - 2
        selection.nettAlbatross = score <= par - 3
      }

      const { cards, fines, achievements } = calculatePokerSelection(selection)

      if (deckPosition + cards > deck.length) {
        throw new Error('The 52-card Poker deck has been exhausted.')
      }

      const dealtCards = deck.slice(deckPosition, deckPosition + cards)
      deckPosition += cards

      return {
        round_id: eventSideRound.id,
        player_id: player.id,
        hole: eventCurrentHole,
        cards_earned: cards,
        fines,
        achievements: {
          events: achievements,
          cards: dealtCards
        }
      }
    })
  }

  function getEventPotPositions() {
    if (!eventSideRound) return []

    const combined = calculateCombinedPositions(
      eventSideRound,
      eventWolfResults,
      eventSkinsResults,
      eventPokerResults
    )

    return eventSideRound.players.map(player => ({
      player,
      ...(combined[player.id] || {
        wolf: 0,
        skins: 0,
        poker: 0,
        total: 0
      })
    }))
  }


  function getEventWolfStandings() {
    if (!eventSideRound || !getEventSideGame('wolf')) return []

    const totals = calculateWolfPoints(
      eventSideRound,
      eventWolfResults
    )

    return [...eventSideRound.players]
      .map(player => ({
        player,
        points: Number(totals[player.id] || 0)
      }))
      .sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points
        return a.player.name.localeCompare(b.player.name)
      })
  }

  function getEventSkinsStandings() {
    if (!eventSideRound || !getEventSideGame('skins')) return []

    const settings = getSkinsSettings(eventSideRound)
    const totals = calculateSkinsTotals(
      eventSideRound,
      eventSkinsResults
    )

    if (settings.mode === 'team') {
      return getSkinsTeams(eventSideRound)
        .map(team => ({
          id: team.id,
          label: team.label,
          skins: team.players.length
            ? Number(totals[team.players[0].id] || 0)
            : 0
        }))
        .sort((a, b) => b.skins - a.skins)
    }

    return [...eventSideRound.players]
      .map(player => ({
        id: player.id,
        label: player.name,
        skins: Number(totals[player.id] || 0)
      }))
      .sort((a, b) => {
        if (a.skins !== b.skins) return b.skins - a.skins
        return a.label.localeCompare(b.label)
      })
  }

  function getEventPokerStandings() {
    if (!eventSideRound || !getEventSideGame('poker')) return []

    const totals = calculatePokerTotals(
      eventSideRound,
      eventPokerResults
    )

    const hands = calculatePokerHands(
      eventSideRound,
      eventPokerResults
    )

    const rows = eventSideRound.players.map(player => {
      const cards = hands[player.id] || []
      const hand = getBestDisplayPokerHand(cards)
      const total = totals[player.id] || {
        cards: 0,
        fines: 0
      }

      return {
        player,
        cards,
        hand,
        fines: Number(total.fines || 0)
      }
    })

    rows.sort((a, b) => {
      if (a.hand && b.hand) {
        const comparison = comparePokerHands(
          a.hand,
          b.hand
        )

        if (comparison !== 0) return -comparison
      } else if (a.hand && !b.hand) {
        return -1
      } else if (!a.hand && b.hand) {
        return 1
      }

      if (a.cards.length !== b.cards.length) {
        return b.cards.length - a.cards.length
      }

      if (a.fines !== b.fines) {
        return a.fines - b.fines
      }

      return a.player.name.localeCompare(b.player.name)
    })

    let previous = null
    let previousRank = 0

    return rows.map((row, index) => {
      let tied = false

      if (previous) {
        if (row.hand && previous.hand) {
          tied =
            comparePokerHands(
              row.hand,
              previous.hand
            ) === 0
        } else {
          tied =
            !row.hand &&
            !previous.hand &&
            row.cards.length === previous.cards.length
        }
      }

      const rank = tied
        ? previousRank
        : index + 1

      previous = row
      previousRank = rank

      return {
        ...row,
        rank
      }
    })
  }

  async function saveEventHole() {
    if (!joinedEvent?.id || !joinedEventGroup?.id) return

    setError('')
    const players = joinedEventGroup.players || []
    const scoreRows = players.map(player => ({
      player,
      score: Number(eventHoleScores[player.id])
    }))

    if (scoreRows.some(row => !Number.isInteger(row.score) || row.score < 1 || row.score > 20)) {
      setError('Enter a score for every golfer before saving the hole.')
      return
    }

    setEventScoreLoading(true)

    try {
      const scorer = await ensureAnonymousUser()

      if (joinedEventGroup.scorer_user_id !== scorer.id) {
        throw new Error('Only this group’s scorer can save these scores.')
      }

      const existingHole = (joinedEvent.holes || []).find(
        hole => Number(hole.hole_number) === Number(eventCurrentHole)
      )

      if (!existingHole) {
        const { error: holeError } = await supabase
          .from('event_holes')
          .insert({
            event_id: joinedEvent.id,
            hole_number: eventCurrentHole,
            par: Number(eventHolePar)
          })

        if (holeError && holeError.code !== '23505') throw holeError
      }

      const rows = scoreRows.map(({ player, score }) => ({
        event_id: joinedEvent.id,
        group_id: joinedEventGroup.id,
        event_player_id: player.id,
        hole_number: eventCurrentHole,
        score
      }))

      const { error: scoresError } = await supabase
        .from('event_hole_scores')
        .upsert(rows, { onConflict: 'event_player_id,hole_number' })

      if (scoresError) throw scoresError

      if (eventSideRound) {
        const playerMap = makeEventRoundPlayerNameMap(joinedEventGroup, eventSideRound)

        if (getEventSideGame('wolf')) {
          await supabase
            .from('wolf_results')
            .delete()
            .eq('round_id', eventSideRound.id)
            .eq('hole', eventCurrentHole)

          const wolfRow = getEventWolfOutcome(scoreRows, playerMap, Number(eventHolePar))

          if (wolfRow) {
            const { error } = await supabase
              .from('wolf_results')
              .insert(wolfRow)

            if (error) throw error
          }
        }

        if (getEventSideGame('skins')) {
          await supabase
            .from('skins_results')
            .delete()
            .eq('round_id', eventSideRound.id)
            .eq('hole', eventCurrentHole)

          const skinsRow = getEventSkinsOutcome(scoreRows, playerMap)

          if (skinsRow) {
            const { error } = await supabase
              .from('skins_results')
              .insert(skinsRow)

            if (error) throw error
          }
        }

        if (getEventSideGame('poker')) {
          await supabase
            .from('poker_results')
            .delete()
            .eq('round_id', eventSideRound.id)
            .eq('hole', eventCurrentHole)

          const pokerRows = getEventPokerRows(scoreRows, playerMap, Number(eventHolePar))

          const { error } = await supabase
            .from('poker_results')
            .insert(pokerRows)

          if (error) throw error
        }
      }

      const savedProgress = Number(joinedEventGroup.current_hole) || 1
      const candidateNextHole = eventCurrentHole >= 18 ? 18 : eventCurrentHole + 1
      const furthestHole = Math.max(savedProgress, candidateNextHole)
      const wasCompleted = joinedEventGroup.status === 'completed'
      const nowCompleted = wasCompleted || eventCurrentHole >= 18
      const wasEditingEarlierHole = eventCurrentHole < savedProgress

      const { error: groupError } = await supabase
        .from('event_groups')
        .update({
          current_hole: furthestHole,
          status: nowCompleted ? 'completed' : 'active'
        })
        .eq('id', joinedEventGroup.id)

      if (groupError) throw groupError

      if (eventSideRound) {
        await supabase
          .from('rounds')
          .update({
            current_hole: furthestHole,
            status: nowCompleted ? 'completed' : 'active'
          })
          .eq('id', eventSideRound.id)
      }

      const fullEvent = await refreshEvent(joinedEvent.id)
      const freshGroup = fullEvent.groups.find(group => group.id === joinedEventGroup.id)
      setJoinedEventGroup(freshGroup)

      let refreshedSideRound = eventSideRound

      if (freshGroup?.round_id) {
        refreshedSideRound = await fetchEventSideRound(freshGroup.round_id)
        setEventSideRound(refreshedSideRound)
        setEventWolfResults(refreshedSideRound.wolfResults || [])
        setEventSkinsResults(refreshedSideRound.skinsResults || [])
        setEventPokerResults(refreshedSideRound.pokerResults || [])
      }

      if (nowCompleted && !wasEditingEarlierHole && eventCurrentHole >= 18) {
        setScreen('event-live')
      } else {
        const returnHole = wasEditingEarlierHole
          ? savedProgress
          : candidateNextHole

        hydrateEventHoleForm(fullEvent, freshGroup, returnHole, refreshedSideRound)

        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: 0,
            behavior: 'smooth'
          })
        })
      }
    } catch (eventError) {
      console.error(eventError)
      setError(eventError.message || 'Could not save the hole.')
    } finally {
      setEventScoreLoading(false)
    }
  }

  async function openEventLive() {
    if (!joinedEvent?.id) return
    setError('')
    setEventLoading(true)

    try {
      const fullEvent = await refreshEvent(joinedEvent.id)
      setJoinedEvent(fullEvent)
      syncEventUrl(fullEvent.event_code)
      setScreen('event-live')
    } catch (eventError) {
      console.error(eventError)
      setError(eventError.message || 'Could not open the live leaderboard.')
    } finally {
      setEventLoading(false)
    }
  }

  function openCreateRound() {
    setError('')

    if (userProfile?.display_name && !players.slice(0, playerCount).some(name => name.trim())) {
      const next = [...players]
      next[0] = userProfile.display_name
      setPlayers(next)
      const nextIds = [...playerProfileIds]
      nextIds[0] = userProfile.id
      setPlayerProfileIds(nextIds)
    }

    setScreen('create')
  }

  async function loadSignedInProfile(user) {
    if (!user) {
      setAuthUser(null)
      setUserProfile(null)
      return null
    }

    setAuthUser(user)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, golfer_code, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError

    setUserProfile(profile || null)
    if (profile?.display_name) {
      setProfileName(profile.display_name)
      await Promise.all([
        loadSavedGolfers(user.id),
        loadSavedGroups(user.id)
      ])
    } else {
      setSavedGolfers([])
      setSavedGroups([])
    }

    return profile || null
  }

  useEffect(() => {
    let cancelled = false

    async function initialiseAccount() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (cancelled) return
        await loadSignedInProfile(data.session?.user || null)
      } catch (accountError) {
        console.error('Could not restore THE POT profile:', accountError)
      }
    }

    initialiseAccount()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return

        window.setTimeout(() => {
          loadSignedInProfile(session?.user || null).catch(accountError => {
            console.error('Could not refresh THE POT profile:', accountError)
          })
        }, 0)
      }
    )

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function saveProfile() {
    const displayName = profileName.trim()

    if (!displayName) {
      setError('Enter the name you want your playing partners to see.')
      return
    }

    setAuthLoading(true)
    setError('')

    try {
      const profileUser = authUser || await ensureAnonymousUser()
      setAuthUser(profileUser)

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: profileUser.id,
            display_name: displayName,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'id' }
        )
        .select('id, display_name, golfer_code, created_at, updated_at')
        .single()

      if (profileError) throw profileError

      setUserProfile(profile)
      await Promise.all([
        loadSavedGolfers(profileUser.id),
        loadSavedGroups(profileUser.id)
      ])
      setScreen('profile')
    } catch (profileError) {
      console.error(profileError)
      setError(profileError.message || 'Could not save your profile.')
    } finally {
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function recoverHostRound() {
      const rawSession = localStorage.getItem(HOST_SESSION_KEY)

      if (!rawSession) {
        if (!cancelled) setRecoveringHost(false)
        return
      }

      try {
        const hostUser = await ensureAnonymousUser()
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
          .eq('host_user_id', hostUser.id)
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
            recoveredRound,
            holeIndex,
            wolfResponse.data || []
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
    if (recoveringHost || screen !== 'home') return

    const params = new URLSearchParams(window.location.search)
    const code = (params.get('round') || '').trim().toUpperCase()

    if (!/^[A-Z0-9]{4}$/.test(code)) return

    let cancelled = false

    async function openSharedRound() {
      setError('')
      setLoading(true)

      try {
        const round = await fetchRoundByCode(code)

        if (cancelled) return

        if (!round) {
          setJoinCode(code)
          setError('Round not found.')
          setScreen('join')
          return
        }

        setJoinedRound(round)
        await openLiveViewer(round)
      } catch (err) {
        if (cancelled) return
        console.error(err)
        setJoinCode(code)
        setError(err.message || 'Could not open the shared round.')
        setScreen('join')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    openSharedRound()

    return () => {
      cancelled = true
    }
  }, [recoveringHost])

  useEffect(() => {
    if (recoveringHost || screen !== 'home') return

    const params = new URLSearchParams(window.location.search)
    const code = (params.get('event') || '').trim().toUpperCase()

    if (!/^[A-Z0-9]{5}$/.test(code)) return

    let cancelled = false

    async function openSharedEvent() {
      setError('')
      setEventLoading(true)

      try {
        const user = await ensureAnonymousUser()
        const event = await fetchEventByCode(code)

        if (cancelled) return

        if (!event) {
          setEventJoinCode(code)
          setError('Event not found.')
          setScreen('join-event')
          return
        }

        const ownGroup = event.groups.find(group => group.scorer_user_id === user.id) || null
        const isOrganiser = event.organiser_user_id === user.id

        setEventJoinCode(code)
        setJoinedEvent(event)
        setJoinedEventGroup(ownGroup)

        if (ownGroup || isOrganiser) {
          setScreen('event-lobby')
        } else {
          setScreen('event-live')
        }
      } catch (eventError) {
        if (cancelled) return

        console.error(eventError)
        setEventJoinCode(code)
        setError(eventError.message || 'Could not open the shared event.')
        setScreen('join-event')
      } finally {
        if (!cancelled) setEventLoading(false)
      }
    }

    openSharedEvent()

    return () => {
      cancelled = true
    }
  }, [recoveringHost])

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

    const nextIds = [...playerProfileIds]
    nextIds[index] = null
    setPlayerProfileIds(nextIds)
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

  function leaveViewerRound() {
    const shouldLeave = window.confirm(
      'Leave this round? You can rejoin at any time using the round code.'
    )

    if (!shouldLeave) return

    setJoinedRound(null)
    setViewerWolfResults([])
    setViewerSkinsResults([])
    setViewerPokerResults([])
    setJoinCode('')
    setError('')

    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('round')
    window.history.replaceState({}, '', cleanUrl.toString())

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

      const isTeamSkins = skinsSettings.mode === 'team'
      const isTie = skinsWinnerId === ''

      const skinsWon = isTie
        ? 0
        : skinsSettings.carryovers
          ? currentSkinValue
          : 1

      const skinsRow = {
        round_id: activeRound.id,
        hole: currentHole,
        winner_player_id: !isTeamSkins && skinsWinnerId ? skinsWinnerId : null,
        winner_team: isTeamSkins && skinsWinnerId ? skinsWinnerId : null,
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
      const finalWolfResults = newWolfResult
        ? [...wolfResults, newWolfResult]
        : wolfResults
      const finalSkinsResults = newSkinsResult
        ? [...skinsResults, newSkinsResult]
        : skinsResults
      const finalPokerResults = newPokerResults.length
        ? [...pokerResults, ...newPokerResults]
        : pokerResults

      await recordSeasonResults(
        activeRound,
        finalWolfResults,
        finalSkinsResults,
        finalPokerResults
      )

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
      activeRound,
      nextIndex,
      newWolfResult
        ? [...wolfResults, newWolfResult]
        : wolfResults
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

      const remainingWolfResults = wolfResults.filter(
        result => Number(result.hole) !== Number(undoHole)
      )

      const scheduledWolf = getScheduledWolf(
        activeRound,
        undoIndex,
        remainingWolfResults
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
        previousSkinsResult?.winner_team || previousSkinsResult?.winner_player_id || ''
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

function getScheduledWolf(round, holeIndex, results = []) {
  const players = round?.players || []

  if (!players.length) return null

  const playerCount = players.length
  const equalRotationHoles =
    Math.floor(18 / playerCount) * playerCount

  // During the equal portion of the round, Wolf follows the
  // normal player-order rotation. The scorer can still override
  // the Wolf manually for an individual hole.
  if (holeIndex < equalRotationHoles) {
    return players[holeIndex % playerCount]
  }

  // Any holes left after every player has received the same
  // number of scheduled Wolf turns become comeback holes.
  // The player currently lowest in the Wolf standings gets Wolf.
  const totals = calculateWolfPoints(round, results)
  const lowestScore = Math.min(
    ...players.map(player => totals[player.id] || 0)
  )

  const tiedLowest = players.filter(
    player => (totals[player.id] || 0) === lowestScore
  )

  if (tiedLowest.length === 1) {
    return tiedLowest[0]
  }

  // Tie-break: among players tied for last, give Wolf to the one
  // who has gone longest since their most recent actual Wolf turn.
  // A player who has never been Wolf is treated as having waited
  // the longest. Player order is the final deterministic tie-break.
  const lastWolfTurn = {}

  players.forEach(player => {
    lastWolfTurn[player.id] = -1
  })

  results.forEach((result, index) => {
    if (result.wolf_player_id) {
      lastWolfTurn[result.wolf_player_id] = index
    }
  })

  return [...tiedLowest].sort((a, b) => {
    const lastTurnDifference =
      lastWolfTurn[a.id] - lastWolfTurn[b.id]

    if (lastTurnDifference !== 0) {
      return lastTurnDifference
    }

    return Number(a.player_order) - Number(b.player_order)
  })[0]
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
  round.players.forEach(player => { positions[player.id] = 0 })

  if (settings.mode === 'team') {
    const teams = getSkinsTeams(round)
    results.forEach(result => {
      if (!result.winner_team || Number(result.skins_won || 0) <= 0) return
      const winningTeam = teams.find(team => team.id === result.winner_team)
      const losingTeam = teams.find(team => team.id !== result.winner_team)
      if (!winningTeam || !losingTeam) return
      const amount = Number(result.skins_won) * dollarsPerSkin
      winningTeam.players.forEach(player => { positions[player.id] += amount })
      losingTeam.players.forEach(player => { positions[player.id] -= amount })
    })
    return positions
  }

  results.forEach(result => {
    if (!result.winner_player_id || Number(result.skins_won || 0) <= 0) return
    const amountPerOpponent = Number(result.skins_won) * dollarsPerSkin
    round.players.forEach(player => {
      if (player.id === result.winner_player_id) return
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
  const scheduledWolf = getScheduledWolf(round, 0, [])

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
    const activeProfileIds = playerProfileIds.slice(0, playerCount)

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

    if (skinsEnabled && skinsMode === 'team' && playerCount !== 4) {
      setError('Team Skins requires exactly 4 players.')
      return
    }

    setLoading(true)

    try {
      const hostUser = await ensureAnonymousUser()
      const roundCode = await generateUniqueRoundCode()

      const { data: round, error: roundError } = await supabase
        .from('rounds')
        .insert({
          round_code: roundCode,
          starting_hole: Number(startingHole),
          current_hole: Number(startingHole),
          status: 'active',
          host_user_id: hostUser.id
        })
        .select()
        .single()

      if (roundError) throw roundError

      const playerRows = activePlayers.map((name, index) => ({
        round_id: round.id,
        name,
        player_order: index + 1,
        profile_id: activeProfileIds[index] || null
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
            carryovers: skinsCarryovers,
            ...(skinsMode === 'team'
              ? {
                  teamOneOrders: skinsTeamPairing === '12v34' ? [1, 2] : skinsTeamPairing === '13v24' ? [1, 3] : [1, 4],
                  teamTwoOrders: skinsTeamPairing === '12v34' ? [3, 4] : skinsTeamPairing === '13v24' ? [2, 4] : [2, 3]
                }
              : {})
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

  async function fetchRoundByCode(code) {
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .select('*')
      .eq('round_code', code)
      .maybeSingle()

    if (roundError) throw roundError
    if (!round) return null

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

    return {
      ...round,
      players: roundPlayers || [],
      games: games || []
    }
  }

  function getRoundShareUrl(code) {
    const url = new URL(window.location.origin)
    url.searchParams.set('round', code)
    return url.toString()
  }

  async function shareRound(code) {
    const shareUrl = getRoundShareUrl(code)
    setShareStatus('')

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'THE POT',
          text: `Join my round on THE POT · ${code}`,
          url: shareUrl
        })
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('Link copied')
    } catch (err) {
      if (err?.name === 'AbortError') return

      try {
        await navigator.clipboard.writeText(shareUrl)
        setShareStatus('Link copied')
      } catch (copyError) {
        console.error(copyError)
        setShareStatus(shareUrl)
      }
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
      const round = await fetchRoundByCode(code)

      if (!round) {
        setError('Round not found.')
        return
      }

      setJoinedRound(round)
      setScreen('joined')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not join the round.')
    } finally {
      setLoading(false)
    }
  }

  async function openLiveViewer(roundToOpen = joinedRound) {
  if (!roundToOpen) return

  setError('')
  setLoading(true)

  try {
    const hasWolf = roundToOpen.games.some(
      game => game.game_type === 'wolf'
    )

    const hasSkins = roundToOpen.games.some(
      game => game.game_type === 'skins'
    )

    const hasPoker = roundToOpen.games.some(
      game => game.game_type === 'poker'
    )

    let existingWolfResults = []
    let existingSkinsResults = []
    let existingPokerResults = []

    if (hasWolf) {
      const { data, error: resultsError } = await supabase
        .from('wolf_results')
        .select('*')
        .eq('round_id', roundToOpen.id)
        .order('created_at', { ascending: true })

      if (resultsError) throw resultsError

      existingWolfResults = data || []
    }

    if (hasSkins) {
      const { data, error: skinsError } = await supabase
        .from('skins_results')
        .select('*')
        .eq('round_id', roundToOpen.id)
        .order('created_at', { ascending: true })

      if (skinsError) throw skinsError

      existingSkinsResults = data || []
    }

    if (hasPoker) {
      const { data, error: pokerError } = await supabase
        .from('poker_results')
        .select('*')
        .eq('round_id', roundToOpen.id)
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
        .eq('id', roundToOpen.id)
        .single()

    if (roundError) throw roundError

    setJoinedRound(current => ({
      ...current,
      ...freshRound
    }))

    setViewerWolfResults(existingWolfResults)
    setViewerSkinsResults(existingSkinsResults)
    setViewerPokerResults(existingPokerResults)

    const viewerUrl = new URL(window.location.href)
    viewerUrl.searchParams.set('round', roundToOpen.round_code)
    window.history.replaceState({}, '', viewerUrl.toString())

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


  async function refreshHostRound() {
    if (!activeRound?.id) return

    setError('')
    setLoading(true)

    try {
      const [
        roundResponse,
        playersResponse,
        gamesResponse,
        wolfResponse,
        skinsResponse,
        pokerResponse
      ] = await Promise.all([
        supabase
          .from('rounds')
          .select('*')
          .eq('id', activeRound.id)
          .single(),
        supabase
          .from('players')
          .select('*')
          .eq('round_id', activeRound.id)
          .order('player_order'),
        supabase
          .from('round_games')
          .select('*')
          .eq('round_id', activeRound.id),
        supabase
          .from('wolf_results')
          .select('*')
          .eq('round_id', activeRound.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('skins_results')
          .select('*')
          .eq('round_id', activeRound.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('poker_results')
          .select('*')
          .eq('round_id', activeRound.id)
          .order('created_at', { ascending: true })
      ])

      const firstError = [
        roundResponse.error,
        playersResponse.error,
        gamesResponse.error,
        wolfResponse.error,
        skinsResponse.error,
        pokerResponse.error
      ].find(Boolean)

      if (firstError) throw firstError

      const refreshedRound = {
        ...roundResponse.data,
        players: playersResponse.data || [],
        games: gamesResponse.data || []
      }

      const sequence = buildHoleSequence(
        refreshedRound.starting_hole
      )

      let holeIndex = sequence.findIndex(
        hole =>
          Number(hole) ===
          Number(refreshedRound.current_hole)
      )

      if (holeIndex < 0) holeIndex = 0
      if (refreshedRound.status === 'completed') {
        holeIndex = 18
      }

      const holeChanged =
        Number(refreshedRound.current_hole) !==
          Number(activeRound.current_hole) ||
        refreshedRound.status !== activeRound.status

      setActiveRound({
        ...refreshedRound,
        holeSequence: sequence,
        holeIndex
      })

      setWolfResults(wolfResponse.data || [])
      setSkinsResults(skinsResponse.data || [])
      setPokerResults(pokerResponse.data || [])

      if (
        holeChanged &&
        refreshedRound.status !== 'completed'
      ) {
        const scheduledWolf = getScheduledWolf(
          refreshedRound,
          holeIndex,
          wolfResponse.data || []
        )

        setWolfPlayerId(scheduledWolf?.id || '')
        setPartnerPlayerId('')
        setWolfResult('win')
        setScoreType('normal')
        setSkinsWinnerId('')
        setPokerSelections(
          makePokerSelections(refreshedRound.players)
        )
      }
    } catch (err) {
      console.error('Host refresh failed:', err)
      setError(
        err.message ||
          'Could not refresh the round.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function refreshLiveViewer() {
    if (!joinedRound || loading) return
    await openLiveViewer(joinedRound)
  }

  useEffect(() => {
    if (screen !== 'live-viewer' || !joinedRound?.id) return

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshLiveViewer()
      }
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [screen, joinedRound?.id])

  useEffect(() => {
    if (!['event-lobby', 'event-live', 'event-scoring'].includes(screen) || !joinedEvent?.id) return undefined

    const refreshCurrentEvent = async () => {
      try {
        await refreshEvent(joinedEvent.id)
      } catch (eventError) {
        console.error(eventError)
      }
    }

    const channel = supabase
      .channel(`event-live-${joinedEvent.id}-${screen}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_groups',
          filter: `event_id=eq.${joinedEvent.id}`
        },
        refreshCurrentEvent
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_players',
          filter: `event_id=eq.${joinedEvent.id}`
        },
        refreshCurrentEvent
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_holes',
          filter: `event_id=eq.${joinedEvent.id}`
        },
        refreshCurrentEvent
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_hole_scores',
          filter: `event_id=eq.${joinedEvent.id}`
        },
        refreshCurrentEvent
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [screen, joinedEvent?.id])

  useEffect(() => {
    if (!['event-lobby', 'event-live', 'event-scoring'].includes(screen) || !joinedEvent?.id) {
      return undefined
    }

    const refreshEventWhenVisible = async () => {
      if (document.visibilityState !== 'visible') return

      try {
        const fullEvent = await refreshEvent(joinedEvent.id)
        const freshGroup = joinedEventGroup
          ? fullEvent.groups.find(group => group.id === joinedEventGroup.id)
          : null

        if (freshGroup) {
          setJoinedEventGroup(freshGroup)
        }

        if (screen === 'event-scoring' && freshGroup?.round_id) {
          const sideRound = await fetchEventSideRound(freshGroup.round_id)
          setEventSideRound(sideRound)
          setEventWolfResults(sideRound.wolfResults || [])
          setEventSkinsResults(sideRound.skinsResults || [])
          setEventPokerResults(sideRound.pokerResults || [])
        }
      } catch (eventError) {
        console.error('Event foreground refresh failed:', eventError)
      }
    }

    document.addEventListener('visibilitychange', refreshEventWhenVisible)

    return () => {
      document.removeEventListener('visibilitychange', refreshEventWhenVisible)
    }
  }, [screen, joinedEvent?.id, joinedEventGroup?.id])

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
              Picking up where you left off.
            </p>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'home') {
    return (
      <main className="app-shell">
        <section className="create-shell home-shell">
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
                onClick={openCreateRound}
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

              <button
                className="account-link-button"
                onClick={() => {
                  setError('')
                  setScreen(userProfile ? 'profile' : 'profile-setup')
                }}
              >
                {userProfile ? `My Profile · ${userProfile.display_name}` : 'Create My Profile'}
              </button>
            </div>

            <div className="home-event-actions">
              <div className="home-event-label">MULTI-GROUP EVENTS</div>
              <div className="home-event-buttons">
                <button className="secondary-button" onClick={openCreateEvent}>
                  Create Event
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    setError('')
                    setJoinedEvent(null)
                    setJoinedEventGroup(null)
                    setEventJoinCode('')
                    setScreen('join-event')
                  }}
                >
                  Join Event
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'create-event') {
    return (
      <main className="app-shell">
        <section className="create-shell event-shell">
          <button className="back-button" onClick={() => setScreen('home')}>← Back</button>

          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="create-header">
            <p className="eyebrow">NEW EVENT</p>
            <h1>Start the event.</h1>
            <p className="intro">Create the event and share the code. Each group scorer enters their own group.</p>
          </div>

          <div className="form-card event-setup-card">
            <div className="form-section">
              <label className="field-label" htmlFor="event-name">Event name</label>
              <input
                id="event-name"
                value={eventName}
                onChange={event => setEventName(event.target.value)}
                placeholder="e.g. THE POT Invitational"
                maxLength={80}
              />
            </div>

            <div className="form-section">
              <h2>Scoring basis</h2>
              <p className="viewer-note">Every group will use the same score basis for the event and side games.</p>
              <div className="segmented">
                {[
                  ['nett', 'Nett'],
                  ['gross', 'Gross']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={eventScoringBasis === value ? 'segment active' : 'segment'}
                    onClick={() => setEventScoringBasis(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              className="primary-button create-button"
              type="button"
              onClick={createEvent}
              disabled={eventLoading}
            >
              {eventLoading ? 'Creating Event...' : 'Create Event'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'event-created' && createdEvent) {
    return (
      <main className="app-shell">
        <section className="create-shell event-shell">
          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="success-card event-success-card">
            <p className="eyebrow">EVENT CREATED</p>
            <h1>{createdEvent.name}</h1>
            <p className="event-code-label">Event code</p>
            <div className="event-code">{createdEvent.event_code}</div>
            <p className="success-copy">
              {createdEvent.scoring_basis === 'nett' ? 'Nett' : 'Gross'} scoring
            </p>
            <p className="viewer-note">Share this code with the group scorers. Each scorer enters their own group and the field builds itself.</p>

            <button
              className="secondary-button event-share-button"
              type="button"
              onClick={() => shareEvent(createdEvent.event_code)}
            >
              Share Event Link
            </button>
            {shareStatus && <p className="share-status event-share-status">{shareStatus}</p>}

            <button className="primary-button" type="button" onClick={() => openEventLobby(createdEvent)}>
              Open Event Lobby
            </button>
            <button
              className="secondary-button event-live-button"
              type="button"
              onClick={() => {
                setJoinedEvent(createdEvent)
                setScreen('event-live')
              }}
            >
              View Live Leaderboard
            </button>
            <button className="tertiary-button" type="button" onClick={leaveEvent}>
              Back to Home
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'join-event') {
    return (
      <main className="app-shell">
        <section className="create-shell event-shell">
          <button className="back-button" onClick={leaveEvent}>← Back</button>
          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="create-header">
            <p className="eyebrow">JOIN EVENT</p>
            <h1>Enter your group.</h1>
            <p className="intro">Enter the event code, then add the golfers you are scoring.</p>
          </div>

          <div className="form-card event-join-card">
            <label className="field-label" htmlFor="event-code-input">Event code</label>
            <div className="event-code-entry">
              <input
                id="event-code-input"
                className="join-code-input"
                value={eventJoinCode}
                onChange={event => {
                  setEventJoinCode(event.target.value.toUpperCase())
                  setJoinedEvent(null)
                  setJoinedEventGroup(null)
                }}
                placeholder="ABCDE"
                maxLength={5}
                autoCapitalize="characters"
              />
              <button className="primary-button" type="button" onClick={findEvent} disabled={eventLoading}>
                {eventLoading ? 'Finding...' : 'Find Event'}
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {joinedEvent && (
              <div className="event-found">
                <div className="event-found-header">
                  <div>
                    <p className="eyebrow">{joinedEvent.event_code}</p>
                    <h2>{joinedEvent.name}</h2>
                  </div>
                  <span className="event-basis-pill">{joinedEvent.scoring_basis === 'nett' ? 'Nett' : 'Gross'}</span>
                </div>

                <button
                  className="secondary-button event-view-live-button"
                  type="button"
                  onClick={openEventLive}
                  disabled={eventLoading}
                >
                  View Live Leaderboard
                </button>

                {joinedEventGroup ? (
                  <div className="event-your-group-banner">
                    <span>Your group is already entered</span>
                    <strong>Group {joinedEventGroup.group_number}</strong>
                    <p>{(joinedEventGroup.players || []).map(player => player.display_name).join(' · ')}</p>
                    <button className="primary-button" type="button" onClick={() => setScreen('event-lobby')}>
                      Open Group
                    </button>
                  </div>
                ) : (
                  <>
                    {savedGroups.length > 0 && (
                      <div className="form-section event-saved-groups">
                        <h3>Saved Groups</h3>
                        <p className="viewer-note">Got the usual crew saved? Load them in one tap.</p>
                        <div className="event-saved-group-list">
                          {savedGroups.map(group => (
                            <button
                              key={group.id}
                              type="button"
                              className="saved-group-chip"
                              onClick={() => loadSavedGroupIntoEvent(group)}
                            >
                              {group.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="form-section">
                      <h3>Golfers in your group</h3>
                      <div className="segmented">
                        {[2, 3, 4].map(count => (
                          <button
                            key={count}
                            type="button"
                            className={eventEntryPlayerCount === count ? 'segment active' : 'segment'}
                            onClick={() => setEventEntryPlayerCount(count)}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="player-inputs event-entry-player-inputs">
                      {eventEntryPlayerNames.slice(0, eventEntryPlayerCount).map((player, playerIndex) => (
                        <input
                          key={`event-entry-player-${playerIndex}`}
                          value={player}
                          onChange={event => updateEventEntryPlayer(playerIndex, event.target.value)}
                          placeholder={`Golfer ${playerIndex + 1}`}
                          maxLength={50}
                        />
                      ))}
                    </div>

                    <div className="form-section event-games-setup">
                      <div className="event-games-heading">
                        <h3>Your group's games</h3>
                        <p className="viewer-note">Optional. These only affect your fourball's pot — not the event leaderboard.</p>
                      </div>

                      <div className="event-game-toggle-grid">
                        <button
                          type="button"
                          className={eventWolfEnabled ? 'event-game-toggle active' : 'event-game-toggle'}
                          onClick={() => setEventWolfEnabled(value => !value)}
                        >
                          Wolf
                        </button>
                        <button
                          type="button"
                          className={eventSkinsEnabled ? 'event-game-toggle active' : 'event-game-toggle'}
                          onClick={() => setEventSkinsEnabled(value => !value)}
                        >
                          Skins
                        </button>
                        <button
                          type="button"
                          className={eventPokerEnabled ? 'event-game-toggle active' : 'event-game-toggle'}
                          onClick={() => setEventPokerEnabled(value => !value)}
                        >
                          3-Putt Poker
                        </button>
                      </div>

                      {eventWolfEnabled && (
                        <div className="event-game-settings-card">
                          <strong>Wolf</strong>
                          <div className="event-settings-grid">
                            <label>
                              $ / point
                              <input type="number" min="0" step="0.5" value={eventWolfDollarPoint} onChange={event => setEventWolfDollarPoint(event.target.value)} />
                            </label>
                            <label>
                              Birdie ×
                              <input type="number" min="1" step="1" value={eventBirdieMultiplier} onChange={event => setEventBirdieMultiplier(event.target.value)} />
                            </label>
                            <label>
                              Eagle ×
                              <input type="number" min="1" step="1" value={eventEagleMultiplier} onChange={event => setEventEagleMultiplier(event.target.value)} />
                            </label>
                          </div>
                        </div>
                      )}

                      {eventSkinsEnabled && (
                        <div className="event-game-settings-card">
                          <strong>Skins</strong>

                          <div className="event-inline-choice">
                            <button
                              type="button"
                              className={eventSkinsMode === 'individual' ? 'event-mini-choice active' : 'event-mini-choice'}
                              onClick={() => setEventSkinsMode('individual')}
                            >
                              Individual
                            </button>
                            <button
                              type="button"
                              className={eventSkinsMode === 'team' ? 'event-mini-choice active' : 'event-mini-choice'}
                              onClick={() => setEventSkinsMode('team')}
                              disabled={eventEntryPlayerCount !== 4}
                            >
                              Team
                            </button>
                          </div>

                          {eventSkinsMode === 'team' && eventEntryPlayerCount === 4 && (
                            <div className="event-inline-choice event-team-pairings">
                              <button type="button" className={eventSkinsTeamPairing === '12v34' ? 'event-mini-choice active' : 'event-mini-choice'} onClick={() => setEventSkinsTeamPairing('12v34')}>1+2 v 3+4</button>
                              <button type="button" className={eventSkinsTeamPairing === '13v24' ? 'event-mini-choice active' : 'event-mini-choice'} onClick={() => setEventSkinsTeamPairing('13v24')}>1+3 v 2+4</button>
                              <button type="button" className={eventSkinsTeamPairing === '14v23' ? 'event-mini-choice active' : 'event-mini-choice'} onClick={() => setEventSkinsTeamPairing('14v23')}>1+4 v 2+3</button>
                            </div>
                          )}

                          <div className="event-settings-grid two-col">
                            <label>
                              $ / skin
                              <input type="number" min="0" step="0.5" value={eventSkinsDollar} onChange={event => setEventSkinsDollar(event.target.value)} />
                            </label>

                            <label className="event-checkbox-setting">
                              <input type="checkbox" checked={eventSkinsCarryovers} onChange={event => setEventSkinsCarryovers(event.target.checked)} />
                              Carryovers
                            </label>
                          </div>
                        </div>
                      )}

                      {eventPokerEnabled && (
                        <div className="event-game-settings-card">
                          <strong>3-Putt Poker</strong>
                          <div className="event-settings-grid two-col">
                            <label>
                              Buy-in
                              <input type="number" min="0" step="1" value={eventPokerBuyIn} onChange={event => setEventPokerBuyIn(event.target.value)} />
                            </label>
                            <label>
                              Fine $
                              <input type="number" min="0" step="1" value={eventPokerFineValue} onChange={event => setEventPokerFineValue(event.target.value)} />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="primary-button create-button"
                      onClick={enterEventGroup}
                      disabled={eventLoading}
                    >
                      {eventLoading ? 'Entering Group...' : 'Enter Group'}
                    </button>
                  </>
                )}

                {joinedEvent.groups.length > 0 && (
                  <div className="event-group-list event-existing-groups">
                    <p className="viewer-note">{joinedEvent.groups.length} group{joinedEvent.groups.length === 1 ? '' : 's'} entered so far.</p>
                    {joinedEvent.groups.map(group => (
                      <div className="event-lobby-group" key={group.id}>
                        <div>
                          <div className="event-group-title-row">
                            <strong>Group {group.group_number}</strong>
                            <span className="group-status ready">Entered</span>
                          </div>
                          <p>{(group.players || []).map(player => player.display_name).join(' · ')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'event-lobby' && joinedEvent) {
    const enteredGroupCount = joinedEvent.groups.length
    const isOrganiser = Boolean(authUser?.id && joinedEvent.organiser_user_id === authUser.id)

    return (
      <main className="app-shell">
        <section className="create-shell event-shell">
          <button
            className="back-button"
            onClick={isOrganiser ? leaveEvent : () => setScreen('join-event')}
          >
            ← Back
          </button>
          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="create-header event-lobby-header">
            <p className="eyebrow">EVENT · {joinedEvent.event_code}</p>
            <h1>{joinedEvent.name}</h1>
            <p className="intro">
              {enteredGroupCount} group{enteredGroupCount === 1 ? '' : 's'} entered · {joinedEvent.scoring_basis === 'nett' ? 'Nett' : 'Gross'} scoring
            </p>

            <div className="event-header-actions">
              <button
                className="refresh-link"
                type="button"
                onClick={() => shareEvent(joinedEvent.event_code)}
              >
                <svg className="event-share-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 10.7 6.8-4.1M8.6 13.3l6.8 4.1" />
                </svg>
                <span>Share Event</span>
              </button>
              {shareStatus && <span className="event-share-inline-status">{shareStatus}</span>}
            </div>
          </div>

          {joinedEventGroup && (
            <div className="event-your-group-banner">
              <span>Your group</span>
              <strong>Group {joinedEventGroup.group_number}</strong>
              <p>{(joinedEventGroup.players || []).map(player => player.display_name).join(' · ')}</p>
              <div className="event-group-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={openEventScoring}
                  disabled={eventScoreLoading}
                >
                  {joinedEventGroup.status === 'completed'
                    ? 'Review Scores'
                    : joinedEventGroup.status === 'active'
                      ? 'Continue Scoring'
                      : 'Start Scoring'}
                </button>
                <button className="secondary-button" type="button" onClick={openEventLive}>
                  Live Leaderboard
                </button>
              </div>
            </div>
          )}

          <div className="event-group-list event-lobby-list">
            {joinedEvent.groups.map(group => (
              <div className="event-lobby-group" key={group.id}>
                <div>
                  <div className="event-group-title-row">
                    <strong>Group {group.group_number}</strong>
                    <span className={group.scorer_user_id ? 'group-status ready' : 'group-status waiting'}>
                      Entered
                    </span>
                  </div>
                  <p>{(group.players || []).map(player => player.display_name).join(' · ')}</p>
                </div>
              </div>
            ))}
          </div>

          {!joinedEventGroup && (
            <button className="primary-button event-lobby-live-button" type="button" onClick={openEventLive}>
              Open Live Leaderboard
            </button>
          )}

          <div className="event-stage-note">
            <strong>Live scoring</strong>
            <span>Each group scorer enters one {joinedEvent.scoring_basis === 'nett' ? 'nett' : 'gross'} score per golfer. The event table updates automatically.</span>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'event-scoring' && joinedEvent && joinedEventGroup) {
    const existingPar = (joinedEvent.holes || []).some(
      hole => Number(hole.hole_number) === Number(eventCurrentHole)
    )

    return (
      <main className="app-shell">
        <section className="create-shell event-shell event-score-shell">
          <button className="back-button" onClick={() => setScreen('event-lobby')}>← Event</button>
          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="event-score-topbar">
            <div>
              <p className="eyebrow">{joinedEvent.name} · GROUP {joinedEventGroup.group_number}</p>
              {eventCurrentHole < Number(joinedEventGroup.current_hole || 1) && (
                <p className="event-editing-note">
                  Editing Hole {eventCurrentHole} · your group stays at Hole {joinedEventGroup.current_hole}
                </p>
              )}
              <h1>Hole {eventCurrentHole}</h1>
            </div>
            <button className="tertiary-button event-score-live-link" type="button" onClick={openEventLive}>
              Live Table
            </button>
          </div>

          <div className="event-score-meta">
            <span>{joinedEvent.scoring_basis === 'nett' ? 'Nett' : 'Gross'} scoring</span>
            <span>Hole {eventCurrentHole} / 18</span>
          </div>

          <div className="form-card event-hole-card">
            <div className="event-par-row">
              <div>
                <span className="field-label">Par</span>
                <p className="viewer-note">
                  {existingPar ? 'Already set for this hole.' : 'Par 4 by default. Change it only if needed.'}
                </p>
              </div>

              <div className="event-par-selector">
                {[3, 4, 5].map(par => (
                  <button
                    key={par}
                    type="button"
                    className={Number(eventHolePar) === par ? 'event-par-button active' : 'event-par-button'}
                    onClick={() => !existingPar && setEventHolePar(par)}
                    disabled={existingPar}
                  >
                    {par}
                  </button>
                ))}
              </div>
            </div>

            <div className="event-score-list">
              {(joinedEventGroup.players || []).map(player => {
                const rawScore = eventHoleScores[player.id]
                const numericScore = rawScore === '' || rawScore == null ? null : Number(rawScore)
                const relative = numericScore == null ? null : numericScore - Number(eventHolePar)

                return (
                  <div className="event-player-score-row" key={player.id}>
                    <div className="event-player-score-name">
                      <strong>{player.display_name}</strong>
                      <span>
                        {relative == null
                          ? joinedEvent.scoring_basis === 'nett' ? 'Nett score' : 'Gross score'
                          : relative === 0
                            ? 'Par'
                            : relative < 0
                              ? `${Math.abs(relative)} under`
                              : `${relative} over`}
                      </span>
                    </div>

                    <div className="event-score-stepper">
                      <button
                        type="button"
                        aria-label={`Decrease ${player.display_name} score`}
                        onClick={() => changeEventHoleScore(player.id, -1)}
                      >
                        −
                      </button>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={rawScore ?? ''}
                        onChange={event => setEventScoreValue(player.id, event.target.value)}
                        placeholder={String(eventHolePar)}
                        aria-label={`${player.display_name} score`}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${player.display_name} score`}
                        onClick={() => changeEventHoleScore(player.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {eventSideRound?.games?.length > 0 && (
              <div className="event-side-games-live">
                <div className="event-side-games-title">
                  <span className="field-label">Your group's pot</span>
                  <span>{eventSideRound.games.map(game => game.game_type === 'poker' ? '3-Putt Poker' : game.game_type[0].toUpperCase() + game.game_type.slice(1)).join(' · ')}</span>
                </div>

                {getEventSideGame('wolf') && (
                  <div className="event-side-game-card">
                    <div className="event-side-game-card-heading">
                      <strong>Wolf</strong>
                      <span>Winner calculated from the scores above</span>
                    </div>

                    <div className="event-wolf-control">
                      <span className="event-control-label">Wolf</span>
                      <div className="event-inline-choice">
                        {eventSideRound.players.map(player => (
                          <button
                            key={player.id}
                            type="button"
                            className={eventWolfPlayerId === player.id ? 'event-mini-choice active' : 'event-mini-choice'}
                            onClick={() => {
                              setEventWolfPlayerId(player.id)
                              if (eventWolfPartnerId === player.id) setEventWolfPartnerId('')
                            }}
                          >
                            {player.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="event-wolf-control">
                      <span className="event-control-label">Partner</span>
                      <div className="event-inline-choice">
                        <button
                          type="button"
                          className={!eventWolfPartnerId ? 'event-mini-choice active' : 'event-mini-choice'}
                          onClick={() => setEventWolfPartnerId('')}
                        >
                          Lone Wolf
                        </button>
                        {eventSideRound.players.filter(player => player.id !== eventWolfPlayerId).map(player => (
                          <button
                            key={player.id}
                            type="button"
                            className={eventWolfPartnerId === player.id ? 'event-mini-choice active' : 'event-mini-choice'}
                            onClick={() => setEventWolfPartnerId(player.id)}
                          >
                            {player.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {getEventSideGame('skins') && (
                  <div className="event-side-game-card compact">
                    <div className="event-side-game-card-heading">
                      <strong>Skins</strong>
                      <span>
                        {getSkinsSettings(eventSideRound).mode === 'team'
                          ? 'Best-ball team result calculates automatically'
                          : 'Lowest unique score wins automatically'}
                      </span>
                    </div>
                  </div>
                )}

                {getEventSideGame('poker') && (
                  <div className="event-side-game-card">
                    <div className="event-side-game-card-heading">
                      <strong>3-Putt Poker</strong>
                      <span>
                        {joinedEvent.scoring_basis === 'nett'
                          ? 'Nett birdie / eagle / albatross are picked up from the score automatically.'
                          : 'Tap any Poker events that happened on the hole.'}
                      </span>
                    </div>

                    <div className="event-poker-player-list">
                      {eventSideRound.players.map(player => {
                        const selection = eventPokerSelections[player.id] || makeEmptyPokerSelection()
                        const buttons = [
                          ['onePutt', '1-Putt'],
                          ...(joinedEvent.scoring_basis === 'nett'
                            ? []
                            : [
                                ['nettBirdie', 'Nett Birdie'],
                                ['nettEagle', 'Nett Eagle'],
                                ['nettAlbatross', 'Nett Albatross']
                              ]),
                          ['chipIn', 'Chip-In'],
                          ['threePutt', '3-Putt'],
                          ['fourPutt', '4-Putt'],
                          ['wipe', 'Wipe']
                        ]

                        return (
                          <div className="event-poker-player" key={player.id}>
                            <strong>{player.name}</strong>
                            <div className="event-poker-buttons">
                              {buttons.map(([field, label]) => (
                                <button
                                  key={field}
                                  type="button"
                                  className={selection[field] ? 'event-poker-button active' : 'event-poker-button'}
                                  onClick={() => {
                                    setEventPokerSelections(current => {
                                      const existing = current[player.id] || makeEmptyPokerSelection()
                                      const next = { ...existing, [field]: !existing[field] }

                                      if (field === 'threePutt' && next.threePutt) next.fourPutt = false
                                      if (field === 'fourPutt' && next.fourPutt) next.threePutt = false

                                      return { ...current, [player.id]: next }
                                    })
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {getEventSideGame('wolf') && (
                  <div className="event-game-standings-block">
                    <div className="event-game-standings-heading">
                      <strong>Wolf Standings</strong>
                      <span>Points</span>
                    </div>

                    <div className="event-game-standings-list">
                      {getEventWolfStandings().map((row, index) => (
                        <div className="event-game-standing-row" key={row.player.id}>
                          <span className="event-standing-rank">{index + 1}</span>
                          <span className="event-standing-name">{row.player.name}</span>
                          <strong>
                            {row.points > 0 ? '+' : ''}
                            {row.points}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {getEventSideGame('skins') && (
                  <div className="event-game-standings-block">
                    <div className="event-game-standings-heading">
                      <strong>Skins Standings</strong>
                      <span>
                        {getSkinsSettings(eventSideRound).mode === 'team'
                          ? 'Teams'
                          : 'Skins won'}
                      </span>
                    </div>

                    <div className="event-game-standings-list">
                      {getEventSkinsStandings().map((row, index) => (
                        <div className="event-game-standing-row" key={row.id}>
                          <span className="event-standing-rank">{index + 1}</span>
                          <span className="event-standing-name">{row.label}</span>
                          <strong>
                            {row.skins} {row.skins === 1 ? 'skin' : 'skins'}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {getEventSideGame('poker') && (
                  <div className="event-game-standings-block event-poker-standings">
                    <div className="event-game-standings-heading">
                      <strong>3-Putt Poker Leaderboard</strong>
                      <span>Live hands</span>
                    </div>

                    <div className="event-poker-leaderboard-list">
                      {getEventPokerStandings().map(row => (
                        <div className="event-poker-leader-row" key={row.player.id}>
                          <span className="event-standing-rank">{row.rank}</span>

                          <div className="event-poker-leader-main">
                            <div className="event-poker-leader-name">
                              <strong>{row.player.name}</strong>
                              <span>
                                {row.hand
                                  ? row.hand.name
                                  : 'No hand yet'}
                                {' · '}
                                {row.fines} {row.fines === 1 ? 'fine' : 'fines'}
                              </span>
                            </div>

                            <div className="event-poker-cards" aria-label={`${row.player.name} cards`}>
                              {row.cards.length ? (
                                row.cards.map((card, cardIndex) => (
                                  <span className="event-playing-card" key={`${row.player.id}-${card}-${cardIndex}`}>
                                    {formatPokerCard(card)}
                                  </span>
                                ))
                              ) : (
                                <span className="event-no-cards">No cards yet</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="event-game-standings-block event-pot-standings">
                  <div className="event-game-standings-heading">
                    <strong>Group Live Pot</strong>
                    <span>Combined</span>
                  </div>

                  <div className="event-live-pot-mini">
                    {getEventPotPositions().map(position => (
                      <div key={position.player.id}>
                        <span>{position.player.name}</span>
                        <strong>{formatMoney(position.total)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <button
              className="primary-button create-button event-save-hole-button"
              type="button"
              onClick={saveEventHole}
              disabled={eventScoreLoading}
            >
              {eventScoreLoading ? 'Saving...' : eventCurrentHole === 18 ? 'Finish Round' : 'Save Hole'}
            </button>

            <div className="event-hole-navigation">
              <button
                className="tertiary-button"
                type="button"
                disabled={eventCurrentHole <= 1 || eventScoreLoading}
                onClick={() => goToEventHole(eventCurrentHole - 1)}
              >
                ← Previous
              </button>
              <button
                className="tertiary-button"
                type="button"
                disabled={eventCurrentHole >= 18 || eventScoreLoading}
                onClick={() => goToEventHole(eventCurrentHole + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'event-live' && joinedEvent) {
    const leaderboard = buildEventLeaderboard(joinedEvent)
    const playersWithScores = leaderboard.filter(player => player.thru > 0).length

    return (
      <main className="app-shell">
        <section className="create-shell event-shell event-live-shell">
          <button
            className="back-button"
            onClick={() => setScreen(joinedEventGroup ? 'event-lobby' : 'join-event')}
          >
            ← Back
          </button>

          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="event-live-header">
            <div>
              <p className="eyebrow">LIVE · {joinedEvent.event_code}</p>
              <h1>{joinedEvent.name}</h1>
              <p className="intro">
                {joinedEvent.scoring_basis === 'nett' ? 'Nett' : 'Gross'} · {joinedEvent.groups.length} group{joinedEvent.groups.length === 1 ? '' : 's'} · {playersWithScores} scoring
              </p>
            </div>
            <div className="event-live-actions">
              <div className="live-badge">
                <span className="live-dot"></span>
                LIVE
              </div>

              <button
                type="button"
                className="refresh-link"
                onClick={async () => {
                  try {
                    setEventLoading(true)
                    await refreshEvent(joinedEvent.id)
                  } finally {
                    setEventLoading(false)
                  }
                }}
                disabled={eventLoading}
              >
                <svg className="refresh-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6v5h-5" />
                  <path d="M19.2 15a8 8 0 1 1-1.7-8.7L20 8.5" />
                </svg>
                <span>{eventLoading ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              <button
                type="button"
                className="refresh-link"
                onClick={() => shareEvent(joinedEvent.event_code)}
              >
                <svg className="event-share-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 10.7 6.8-4.1M8.6 13.3l6.8 4.1" />
                </svg>
                <span>Share</span>
              </button>
            </div>
          </div>

          {shareStatus && <p className="share-status event-share-status">{shareStatus}</p>}

          <div className="event-leaderboard-card">
            <div className="event-leaderboard-head">
              <span>Pos</span>
              <span>Golfer</span>
              <span>Thru</span>
              <span>Score</span>
            </div>

            {leaderboard.length === 0 ? (
              <div className="event-leaderboard-empty">
                No groups have entered yet.
              </div>
            ) : (
              leaderboard.map(player => (
                <div
                  className={player.thru > 0 ? 'event-leaderboard-row' : 'event-leaderboard-row not-started'}
                  key={player.id}
                >
                  <strong className="event-position">
                    {player.thru > 0 ? player.position : '—'}
                  </strong>
                  <div className="event-leaderboard-player">
                    <strong>{player.display_name}</strong>
                    <span>Group {player.group_number}</span>
                  </div>
                  <span>{player.thru || '—'}</span>
                  <strong className="event-to-par">
                    {formatEventToPar(player.toPar, player.thru)}
                  </strong>
                </div>
              ))
            )}
          </div>

          <p className="event-live-footnote">
            Scores update automatically as each group locks in a hole.
          </p>
        </section>
      </main>
    )
  }

  if (screen === 'profile-setup') {
    return (
      <main className="app-shell">
        <section className="create-shell account-shell">
          <button
            className="back-button"
            onClick={() => {
              setError('')
              setScreen('home')
            }}
          >
            ← Back
          </button>

          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo small-logo"
          />

          <div className="create-header">
            <p className="eyebrow">MY PROFILE</p>
            <h1>Make it official.</h1>
            <p className="intro">
              Add your name and you’re in. No login required.
            </p>
          </div>

          <div className="form-card account-card">
            <label>
              Display name
              <input
                type="text"
                autoComplete="name"
                placeholder="Ben"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveProfile()
                }}
              />
            </label>

            <p className="profile-device-note">
              Your profile stays on this device for now.
            </p>

            {error && <div className="error-message">{error}</div>}

            <button
              type="button"
              className="primary-button"
              onClick={saveProfile}
              disabled={authLoading}
            >
              {authLoading ? 'Saving...' : 'Create Profile'}
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'profile') {
    return (
      <main className="app-shell">
        <section className="create-shell account-shell">
          <button
            className="back-button"
            onClick={() => {
              setError('')
              setScreen('home')
            }}
          >
            ← Back
          </button>

          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo small-logo"
          />

          <div className="create-header">
            <p className="eyebrow">MY PROFILE</p>
            <h1>{userProfile?.display_name || 'THE POT golfer'}</h1>
            <p className="intro">
              Your rounds, your regulars and your place on the table.
            </p>
          </div>

          <div className="form-card account-card profile-summary-card">
            <div className="profile-summary-row">
              <span>Name</span>
              <strong>{userProfile?.display_name}</strong>
            </div>
            <div className="profile-summary-row">
              <span>This device</span>
              <strong>Profile saved</strong>
            </div>
            <div className="profile-summary-row golfer-code-row">
              <span>Golfer code</span>
              <strong>{userProfile?.golfer_code || '—'}</strong>
            </div>
            <p className="golfer-code-help">
              Share your code with the group once. After that, your rounds and results follow you no matter who keeps score.
            </p>

            <div className="my-golfers-section">
              <div className="my-golfers-heading">
                <div>
                  <p className="eyebrow">MY GOLFERS</p>
                  <h2>The usual crew</h2>
                </div>
                <span>{savedGolfers.length}</span>
              </div>

              {savedGolfers.length > 0 ? (
                <div className="saved-golfers-list">
                  {savedGolfers.map(golfer => (
                    <div key={golfer.id} className="saved-golfer-row">
                      <div className="saved-golfer-identity">
                        <strong>{golfer.display_name}</strong>
                        <span className={golfer.linked_profile_id ? 'golfer-status linked' : 'golfer-status guest'}>
                          {golfer.linked_profile_id ? 'Linked' : 'Guest'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="golfer-remove-button"
                        onClick={() => removeSavedGolfer(golfer)}
                        disabled={golfersLoading}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="my-golfers-empty">
                  Add the golfers you play with most. They’ll be ready to go next Saturday.
                </p>
              )}

              <div className="golfer-link-card">
                <div className="golfer-link-copy">
                  <strong>Link a THE POT golfer</strong>
                  <span>Got their golfer code? Link them once and their results stay with them.</span>
                </div>
                <div className="add-golfer-row">
                  <input
                    type="text"
                    placeholder="Golfer code"
                    value={newGolferCode}
                    onChange={e => setNewGolferCode(e.target.value.toUpperCase())}
                    onKeyDown={e => {
                      if (e.key === 'Enter') linkSavedGolferByCode()
                    }}
                  />
                  <button
                    type="button"
                    className="secondary-button add-golfer-button"
                    onClick={linkSavedGolferByCode}
                    disabled={golfersLoading}
                  >
                    {golfersLoading ? 'Linking...' : 'Link'}
                  </button>
                </div>
              </div>

              <div className="golfer-guest-card">
                <div className="golfer-link-copy">
                  <strong>Add a guest</strong>
                  <span>No code? No problem. Add their name and get on with the round.</span>
                </div>
                <div className="add-golfer-row">
                  <input
                    type="text"
                    placeholder="Guest golfer name"
                    value={newGolferName}
                    onChange={e => setNewGolferName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addSavedGolfer()
                    }}
                  />
                  <button
                    type="button"
                    className="secondary-button add-golfer-button"
                    onClick={addSavedGolfer}
                    disabled={golfersLoading}
                  >
                    {golfersLoading ? 'Saving...' : '+ Guest'}
                  </button>
                </div>
              </div>
            </div>

            <div className="saved-groups-section">
              <div className="my-golfers-heading">
                <div>
                  <p className="eyebrow">SAVED GROUPS</p>
                  <h2>Your regular groups</h2>
                </div>
                <span>{savedGroups.length}</span>
              </div>

              {savedGroups.length > 0 ? (
                <div className="saved-groups-list">
                  {savedGroups.map(group => (
                    <div key={group.id} className="saved-group-card">
                      <div className="saved-group-topline">
                        <div>
                          <strong>{group.name}</strong>
                          <span>
                            {(group.members || []).map(member => member.display_name).join(' · ')}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="golfer-remove-button"
                          onClick={() => removeSavedGroup(group)}
                          disabled={groupsLoading}
                        >
                          Remove
                        </button>
                      </div>
                      <button
                        type="button"
                        className="primary-button group-use-button"
                        onClick={() => loadSavedGroup(group, true)}
                      >
                        Start Round
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="my-golfers-empty">
                  Save the usual lineup and load everyone in one tap.
                </p>
              )}

              <div className="group-builder-card">
                <div className="golfer-link-copy">
                  <strong>Create a saved group</strong>
                  <span>Pick 2–4 golfers and give the group a name.</span>
                </div>

                <input
                  type="text"
                  placeholder="Group name — e.g. Saturday Crew"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                />

                <div className="group-member-picker">
                  {getGroupChoices().map(choice => {
                    const selected = newGroupSelections.includes(choice.key)

                    return (
                      <button
                        key={choice.key}
                        type="button"
                        className={selected ? 'group-member-chip selected' : 'group-member-chip'}
                        onClick={() => toggleNewGroupMember(choice.key)}
                      >
                        {choice.display_name} · {choice.label}
                      </button>
                    )
                  })}
                </div>

                <button
                  type="button"
                  className="primary-button group-save-button"
                  onClick={createSavedGroup}
                  disabled={groupsLoading}
                >
                  {groupsLoading ? 'Saving...' : 'Save Group'}
                </button>
              </div>
            </div>

            <div className="profile-season-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => openSeasonScreen('history')}
                disabled={seasonLoading}
              >
                {seasonLoading ? 'Loading...' : 'Round History'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => openSeasonScreen('standings')}
                disabled={seasonLoading}
              >
                {seasonYear} Standings
              </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="button"
              className="primary-button"
              onClick={openCreateRound}
            >
              Start a Round
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => setScreen('home')}
            >
              Done
            </button>

            <button
              type="button"
              className="account-link-button"
              onClick={() => {
                setError('')
                setProfileName(userProfile?.display_name || '')
                setScreen('profile-setup')
              }}
            >
              Edit Name
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'history') {
    const totalPoints = roundHistory.reduce((sum, row) => sum + Number(row.season_points || 0), 0)
    const totalPot = roundHistory.reduce((sum, row) => sum + Number(row.pot_total || 0), 0)
    const wins = roundHistory.filter(row => Number(row.final_position) === 1).length

    return (
      <main className="app-shell">
        <section className="create-shell account-shell">
          <button className="back-button" onClick={() => setScreen('profile')}>← Back</button>
          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="create-header">
            <p className="eyebrow">ROUND HISTORY</p>
            <h1>{seasonYear} rounds.</h1>
            <p className="intro">Every completed round. Every win, loss and dollar.</p>
          </div>

          <div className="form-card season-screen-card">
            <div className="season-summary-strip">
              <div className="season-summary-stat"><span>Rounds</span><strong>{roundHistory.length}</strong></div>
              <div className="season-summary-stat"><span>Points</span><strong>{totalPoints.toFixed(totalPoints % 1 ? 1 : 0)}</strong></div>
              <div className="season-summary-stat"><span>Net Pot</span><strong>{formatMoney(totalPot)}</strong></div>
            </div>

            {roundHistory.length > 0 ? (
              <div className="history-list">
                {roundHistory.map(row => {
                  const roundInfo = Array.isArray(row.rounds) ? row.rounds[0] : row.rounds
                  return (
                    <div key={`${row.round_id}:${row.profile_id}`} className="history-row">
                      <div className="history-main">
                        <strong>Round {roundInfo?.round_code || '—'}</strong>
                        <span>{formatHistoryDate(row.completed_at)} · {row.player_count} players · {row.is_tie ? 'T' : ''}{row.final_position}{row.final_position === 1 ? 'st' : row.final_position === 2 ? 'nd' : row.final_position === 3 ? 'rd' : 'th'}</span>
                      </div>
                      <div className="history-result">
                        <strong>{formatMoney(row.pot_total)}</strong>
                        <span>+{Number(row.season_points || 0).toFixed(Number(row.season_points || 0) % 1 ? 1 : 0)} pts</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="season-empty">Nothing on the card yet. Finish a round and it’ll show up here.</p>
            )}

            <button type="button" className="secondary-button" onClick={() => openSeasonScreen('standings')}>View {seasonYear} Standings</button>
          </div>
        </section>
      </main>
    )
  }

  if (screen === 'standings') {
    const myStandingIndex = seasonStandings.findIndex(row => row.profile_id === userProfile?.id)
    const myStanding = myStandingIndex >= 0 ? seasonStandings[myStandingIndex] : null

    return (
      <main className="app-shell">
        <section className="create-shell account-shell">
          <button className="back-button" onClick={() => setScreen('profile')}>← Back</button>
          <img src="/brand/the-pot-logo.png" alt="THE POT" className="brand-logo small-logo" />

          <div className="create-header">
            <p className="eyebrow">THE POT SEASON</p>
            <h1>{seasonYear} Standings.</h1>
            <p className="intro">Every round counts. Stack points across the season and see who finishes on top.</p>
          </div>

          <div className="form-card season-screen-card">
            {myStanding && (
              <div className="season-summary-strip">
                <div className="season-summary-stat"><span>Your Rank</span><strong>#{myStandingIndex + 1}</strong></div>
                <div className="season-summary-stat"><span>Points</span><strong>{myStanding.points.toFixed(myStanding.points % 1 ? 1 : 0)}</strong></div>
                <div className="season-summary-stat"><span>Wins</span><strong>{myStanding.wins}</strong></div>
              </div>
            )}

            {seasonStandings.length > 0 ? (
              <>
                <div className="standings-header">
                  <span>#</span><span>Golfer</span><span>Rnds</span><span>Pts</span><span className="standings-net-column">Net Pot</span>
                </div>
                <div className="standings-list">
                  {seasonStandings.map((row, index) => (
                    <div key={row.profile_id} className="standings-row">
                      <div className="standings-rank">{index + 1}</div>
                      <div className="standings-golfer">
                        <strong>{row.display_name}{row.profile_id === userProfile?.id ? ' · You' : ''}</strong>
                        <span>{row.wins} {row.wins === 1 ? 'win' : 'wins'}</span>
                      </div>
                      <div className="standings-number">{row.rounds}</div>
                      <div className="standings-number standings-points">{row.points.toFixed(row.points % 1 ? 1 : 0)}</div>
                      <div className="standings-number standings-net-column">{formatMoney(row.netPot)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="season-empty">The table’s empty. Finish the first round and set the benchmark.</p>
            )}

            <p className="season-rules-note">How points work: 4 players — 100 / 70 / 50 / 30; 3 players — 100 / 65 / 40; 2 players — 100 / 50. Tied positions split the points for those places evenly.</p>
            <button type="button" className="secondary-button" onClick={() => openSeasonScreen('history')}>View My Round History</button>
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
              You’re in. Follow the round live as the scores come in.
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
              onClick={() => openLiveViewer()}
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

          <div className="viewer-live-actions">
            <div className="live-refresh-row">
              <div className="live-badge">
                <span className="live-dot"></span>
                LIVE
              </div>

              <button
                type="button"
                className="refresh-link"
                onClick={refreshLiveViewer}
                disabled={loading}
              >
                <svg
                  className="refresh-link-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20 6v5h-5" />
                  <path d="M19.2 15a8 8 0 1 1-1.7-8.7L20 8.5" />
                </svg>
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>

            <button
              type="button"
              className="secondary-button viewer-refresh-button"
              onClick={leaveViewerRound}
              disabled={loading}
            >
              Leave Round
            </button>
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
              {viewerSkinsSettings.mode === 'team'
                ? getSkinsTeams(joinedRound).map(team => {
                    const teamSkins = team.players.length
                      ? viewerSkinsTotals[team.players[0].id] || 0
                      : 0

                    return (
                      <div
                        key={team.id}
                        className="score-row"
                      >
                        <span>{team.label}</span>
                        <strong>
                          {teamSkins} {teamSkins === 1 ? 'skin' : 'skins'}
                        </strong>
                      </div>
                    )
                  })
                : joinedRound.players.map(player => (
                    <div
                      key={player.id}
                      className="score-row"
                    >
                      <span>{player.name}</span>
                      <strong>{viewerSkinsTotals[player.id] || 0}</strong>
                    </div>
                  ))}
            </div>

            {viewerSkinsSettings.mode === 'team' && viewerSkinsResults.length > 0 && (
              <>
                <div className="viewer-section-title">
                  <span>Skins Results</span>
                  <span>Hole by hole</span>
                </div>

                <div className="scoreboard-card">
                  {viewerSkinsResults.map(result => {
                    const winningTeam = getSkinsTeams(joinedRound).find(
                      team => team.id === result.winner_team
                    )
                    const skinsWon = Number(result.skins_won || 0)

                    return (
                      <div
                        key={result.id}
                        className="score-row"
                      >
                        <span>Hole {result.hole}</span>
                        <strong>
                          {winningTeam
                            ? `${winningTeam.label} · ${skinsWon} ${skinsWon === 1 ? 'skin' : 'skins'}`
                            : 'Tie'}
                        </strong>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
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
                  getBestDisplayPokerHand(cards)

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
                  Poker is tied between{' '}
                  {viewerPokerOutcome.winners
                    .map(item => item.player.name)
                    .join(' and ')}.
                  Settle the pot manually.
                </div>
              )}

            {isComplete &&
              viewerPokerOutcome?.status === 'no-winner' && (
                <div className="error-message">
                  No cards dealt this round, so there’s no Poker winner.
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
          Live view · Scores update automatically
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
              Send the code to the group, then get the first hole underway.
            </p>

            <div className="player-list">
              {createdRound.players.map(player => (
                <div key={player.id} className="player-pill">
                  {player.name}
                </div>
              ))}
            </div>

            <div className="round-share-actions">
              <button
                className="secondary-button"
                onClick={() => shareRound(createdRound.round_code)}
                type="button"
              >
                Share Round
              </button>

              <button
                className="primary-button"
                onClick={() => startRound(createdRound)}
                type="button"
              >
                Start Round
              </button>
            </div>

            {shareStatus && (
              <p className="share-status">{shareStatus}</p>
            )}
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

          <div className="round-topbar-actions">
            <div className="live-refresh-row">
              <div className="live-badge">
                <span className="live-dot"></span>
                LIVE
              </div>

              <button
                type="button"
                className="refresh-link"
                onClick={refreshHostRound}
                disabled={loading}
              >
                <svg
                  className="refresh-link-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20 6v5h-5" />
                  <path d="M19.2 15a8 8 0 1 1-1.7-8.7L20 8.5" />
                </svg>
                <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>

            <div className="host-round-meta">
              <div className="hole-progress">
                {Math.min(activeRound.holeIndex + 1, 18)} / 18
              </div>

              <button
                type="button"
                className="secondary-button active-share-button"
                onClick={() => shareRound(activeRound.round_code)}
              >
                Share Round
              </button>
            </div>
          </div>
        </div>

        {shareStatus && (
          <p className="share-status active-share-status">{shareStatus}</p>
        )}

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

        {getSkinsSettings(activeRound).mode === 'team'
          ? getSkinsTeams(activeRound).map(team => (
              <button
                key={team.id}
                type="button"
                className={skinsWinnerId === team.id ? 'choice-button active' : 'choice-button'}
                onClick={() => setSkinsWinnerId(team.id)}
              >
                {team.label}
              </button>
            ))
          : activeRound.players.map(player => (
              <button
                key={player.id}
                type="button"
                className={skinsWinnerId === player.id ? 'choice-button active' : 'choice-button'}
                onClick={() => setSkinsWinnerId(player.id)}
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
                  getBestDisplayPokerHand(cards)

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
                  Poker is tied between{' '}
                  {pokerOutcome.winners
                    .map(item => item.player.name)
                    .join(' and ')}.
                  Settle the pot manually.
                </div>
              )}

            {hasPoker &&
              pokerOutcome?.status === 'no-winner' && (
                <div className="error-message">
                  No cards dealt this round, so there’s no Poker winner.
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

            {userProfile && savedGroups.length > 0 && (
              <div className="quick-groups">
                <div className="quick-golfers-label">Saved groups</div>
                <div className="quick-groups-grid">
                  {savedGroups.map(group => (
                    <button
                      key={group.id}
                      type="button"
                      className="saved-group-chip"
                      onClick={() => loadSavedGroup(group)}
                    >
                      <strong>{group.name}</strong>
                      <span>{(group.members || []).map(member => member.display_name).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {userProfile && (
              <div className="quick-golfers">
                <div className="quick-golfers-label">Quick select</div>
                <div className="quick-golfers-chips">
                  {[
                    { id: 'self', display_name: userProfile.display_name, profile_id: userProfile.id, isSelf: true },
                    ...savedGolfers
                  ].map(golfer => {
                    const golferProfileId = golfer.profile_id || golfer.linked_profile_id || null
                    const selected = golferProfileId
                      ? playerProfileIds.slice(0, playerCount).some(id => id === golferProfileId)
                      : players.slice(0, playerCount).some(
                          name => name.trim().toLowerCase() === golfer.display_name.toLowerCase()
                        )

                    return (
                      <button
                        key={golfer.id}
                        type="button"
                        className={selected ? 'golfer-chip selected' : 'golfer-chip'}
                        onClick={() => toggleRoundGolfer(golfer)}
                      >
                        {golfer.display_name}{golfer.isSelf ? ' · You' : golfer.linked_profile_id ? ' · Linked' : ' · Guest'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

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

                {skinsMode === 'team' && (
                  <label>
                    Teams
                    <select value={skinsTeamPairing} onChange={e => setSkinsTeamPairing(e.target.value)}>
                      <option value="12v34">{(players[0] || 'Player 1')} + {(players[1] || 'Player 2')} vs {(players[2] || 'Player 3')} + {(players[3] || 'Player 4')}</option>
                      <option value="13v24">{(players[0] || 'Player 1')} + {(players[2] || 'Player 3')} vs {(players[1] || 'Player 2')} + {(players[3] || 'Player 4')}</option>
                      <option value="14v23">{(players[0] || 'Player 1')} + {(players[3] || 'Player 4')} vs {(players[1] || 'Player 2')} + {(players[2] || 'Player 3')}</option>
                    </select>
                    {playerCount !== 4 && <span className="field-note">Team Skins requires 4 players.</span>}
                  </label>
                )}

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