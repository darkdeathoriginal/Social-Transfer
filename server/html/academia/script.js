const queryString = window.location.search;
const searchParams = new URLSearchParams(queryString);
const paramValue = searchParams.get("number");
var inputElement = document.getElementById("number");
var input = document.querySelector("#number");
var iti = window.intlTelInput(input, {
  separateDialCode: true,
});
iti.setNumber(paramValue);

var countryCode = document.querySelector("#country-code");
countryCode.value = iti.getSelectedCountryData().dialCode
input.addEventListener("countrychange", function () {
  var selectedCountry = iti.getSelectedCountryData();
  countryCode.value = selectedCountry.dialCode;
});
