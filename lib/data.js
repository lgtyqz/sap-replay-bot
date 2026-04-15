const fs = require('fs');

const rawPets = JSON.parse(fs.readFileSync('pets.json'));
const PETS = {};
for (const pet of rawPets) {
  PETS[pet.Id] = pet;
}

const rawPerks = JSON.parse(fs.readFileSync('perks.json'));
const PERKS = {};
for (const perk of rawPerks) {
  PERKS[perk.Id] = perk;
}

const rawToys = JSON.parse(fs.readFileSync('toys.json'));
const TOYS = {};
for (const toy of rawToys) {
  TOYS[toy.Id] = toy;
}

const rawFood = JSON.parse(fs.readFileSync('food.json'));
const FOOD = {};
for (const food of rawFood) {
  FOOD[food.Id] = food;
}

module.exports = {
  PETS,
  PERKS,
  TOYS,
  FOOD
};
