# Distributed Systems Project

## Description of System
- Implementation of a simplified P2P UNO-like game
- Use of cryptographic algorithm to prevent cheating
    - In typical P2P System at least one player would have access to the cards of the other players.

## Components
- User & Authentication Server
    - For more security one could rotate secrets
    - Gives out JWTs to clients
        - Relatively short timeout
        - Need to be refreshed with refresh token
    - Dilemma between security and scalability:
        - Very short expiration: Tokens can be invalidated easily
        - Long expiration: 
            - Less queries on User DB required
            - When malicious person hijacks token it is not possible to invalidate the token
    - Centralized, s.t. credentials are always consistents

- Leaderboard Server
    - Stores the outcomes of all the matches
    - Exact timing not important
    - Players democratically vote on result
    - Independent from Authentication server
    - Knows Public key of auth server for token verification
    - Eventual consistency
    - Distributed caching

- Matchmaking/Signaling server
    - Required for peers to establish connection
    - Authenticated users can open rooms
    - Can be independent from other servers
    - Fixed list of multiple backup servers
        - Only works if the server is not reachable for all players at the same time

- P2P Client Protocol
    - Fully connected connection between all clients
        - Only few players -> not too bad
    - Main principle -> we trust no one
        - One could think about adding E2E encryption mechanisms to try to prevent Man-in-the-middle attacks
    - Custom cryptographic protocol

## Fault Tolerance
- User & Auth server goes offline
    - Users cannot login
    - Existing JWTs are still usable with the other Servers (as long as outage is shortlived)

- Leaderboard server goes offline
    - Not a big problem, due to redundancy

- Matchmaking Signaling server goes offline
    - Only a problem if all backup servers are also offline


### P2P
- Player loses connection to all other players
    - Wait for specific amount of time for reconnect, then kick player out by voting
    - We cannot e.g. replace the player by a bot as nobody else knows their cards
- Connection between two players gets lost, but graph is still connected
    - Distribute a PAUSE signal throughout the network
    - Send CONTINUE when connection has been reestablished
    - If this process takes too long, players with incomplete connections to other players get voted out
        - Players always vote against themselves to handle the case where one player loses connection to all other

## Future Work
- Bots
    - Just like regular clients, but play cards automatically